import { z } from "zod";
import { logger } from "../logger";
import type { ProviderAdapter } from "./types";

// ─── TenantMode schema ─────────────────────────────────────────────────────

export const TenantModeProviderSchema = z.enum([
	"postgres",
	"neon",
	"turso",
	"planetscale",
	"supabase",
]);

export type TenantModeProvider = z.infer<typeof TenantModeProviderSchema>;

/**
 * Configuration describing how multi-tenant guardrails behave for a project.
 */
export const TenantModeSchema = z.object({
	enabled: z.boolean(),
	tenantColumn: z.string().min(1).default("tenant_id"),
	strict: z.boolean().default(false),
	provider: TenantModeProviderSchema.optional(),
});

export type TenantMode = z.infer<typeof TenantModeSchema>;

// ─── Guardrail violation error ─────────────────────────────────────────────

/**
 * Typed error thrown when a guardrail (tenant scoping) is violated.
 * This is a real enforcement failure, not a placeholder.
 */
export class GuardrailViolationError extends Error {
	readonly table: string;
	readonly operation: "read" | "write";
	readonly reason: string;

	constructor(operation: "read" | "write", table: string, reason: string) {
		super(
			`Tenant guardrail violation (${operation}) on table "${table}": ${reason}`,
		);
		this.name = "GuardrailViolationError";
		this.operation = operation;
		this.table = table;
		this.reason = reason;
	}
}

// ─── Enforcement options ───────────────────────────────────────────────────

export interface EnforceOptions {
	/**
	 * The tenant id being written/read. When present, the operation is
	 * considered tenant-scoped and the engine will treat the tenant column
	 * as satisfied.
	 */
	tenantId?: string;
	/**
	 * Indicates the operation already includes a filter on the tenant column,
	 * e.g. a generated query that injects `tenant_id = $1`.
	 */
	hasTenantFilter?: boolean;
	/**
	 * Bypass scopes for service-role maintenance jobs. Audited and must be
	 * an explicit, intentional flag.
	 */
	bypass?: boolean;
	/**
	 * Human-readable reason for a bypass (audited). Required when `bypass` is true.
	 */
	bypassReason?: string;
	/**
	 * Tables that are exempt from tenant scoping (e.g. global lookup tables).
	 * Matching is exact, case-sensitive.
	 */
	exemptTables?: string[];
}

// ─── Guardrail engine ──────────────────────────────────────────────────────

/**
 * Provider-agnostic multi-tenant guardrail engine (Phase B).
 *
 * Given a provider adapter and a {@link TenantMode} config, the engine enforces
 * tenant scoping on configured (multi-tenant) tables:
 *
 * - Writes touching a tenant column table must include a tenant value/filter,
 *   otherwise the engine rejects via {@link GuardrailViolationError}.
 * - In strict mode, reads without tenant scoping on a multi-tenant table are
 *   also rejected.
 * - When the provider does not support native RLS, the engine still enforces at
 *   the application layer (and logs a warning), since RLS is unavailable.
 */
export class GuardrailEngine {
	readonly provider: ProviderAdapter;
	readonly mode: TenantMode;

	constructor(provider: ProviderAdapter, mode: TenantMode) {
		this.provider = provider;
		this.mode = TenantModeSchema.parse(mode);
	}

	/** Whether a given table participates in tenant scoping. */
	private isTenantTable(table: string, opts: EnforceOptions): boolean {
		if (!this.mode.enabled) return false;
		if (opts.exemptTables?.includes(table)) return false;
		return true;
	}

	/**
	 * Enforce tenant scoping for a write (insert/update/delete) against a table.
	 * @throws GuardrailViolationError when unscoped.
	 */
	enforceWrite(table: string, opts: EnforceOptions = {}): void {
		if (!this.isTenantTable(table, opts)) return;

		if (opts.bypass) {
			if (!opts.bypassReason) {
				throw new GuardrailViolationError(
					"write",
					table,
					"bypass requires a reason",
				);
			}
			this.auditBypass("write", table, opts.bypassReason);
			return;
		}

		const scoped = opts.tenantId !== undefined || opts.hasTenantFilter === true;
		if (!scoped) {
			this.warnAppEnforced("write", table);
			throw new GuardrailViolationError(
				"write",
				table,
				`write to tenant-scoped table requires a ${this.mode.tenantColumn} value or filter`,
			);
		}
	}

	/**
	 * Enforce tenant scoping for a read against a table. Only enforced when
	 * strict mode is enabled (providers with RLS handle non-strict reads natively).
	 * @throws GuardrailViolationError when strict and unscoped.
	 */
	enforceRead(table: string, opts: EnforceOptions = {}): void {
		if (!this.isTenantTable(table, opts)) return;
		if (!this.mode.strict) return;

		if (opts.bypass) {
			if (!opts.bypassReason) {
				throw new GuardrailViolationError(
					"read",
					table,
					"bypass requires a reason",
				);
			}
			this.auditBypass("read", table, opts.bypassReason);
			return;
		}

		const scoped = opts.tenantId !== undefined || opts.hasTenantFilter === true;
		if (!scoped) {
			this.warnAppEnforced("read", table);
			throw new GuardrailViolationError(
				"read",
				table,
				`strict mode requires a ${this.mode.tenantColumn} filter on reads of this table`,
			);
		}
	}

	/**
	 * Build a tenant context object carrying the bound tenant id. This is used
	 * to propagate scoping into queries/mutations created for a tenant.
	 */
	withTenant(ctx: { [key: string]: unknown }, tenantId: string): { tenantId: string } {
		return { tenantId };
	}

	// ── internal helpers ────────────────────────────────────────────────────

	private warnAppEnforced(operation: "read" | "write", table: string): void {
		if (this.provider.supportsRLS()) return;
		logger.warn(
			{
				provider: this.provider.type,
				table,
				operation,
				tenantColumn: this.mode.tenantColumn,
			},
			"[guardrail] provider does not support native RLS; enforcing tenant scoping at the application layer",
		);
	}

	private auditBypass(
		operation: "read" | "write",
		table: string,
		reason?: string,
	): void {
		logger.warn(
			{
				provider: this.provider.type,
				table,
				operation,
				bypassReason: reason ?? "no reason supplied",
			},
			"[guardrail] tenant scoping bypassed (service-role maintenance)",
		);
	}
}

/**
 * Construct a guardrail engine only when tenant mode is enabled, otherwise null.
 * Keeps callers from paying for an engine that will passthrough everything.
 */
export function createGuardrailEngine(
	provider: ProviderAdapter,
	mode: TenantMode | null | undefined,
): GuardrailEngine | null {
	if (!mode || !mode.enabled) return null;
	return new GuardrailEngine(provider, mode);
}
