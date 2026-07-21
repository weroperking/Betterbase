import { z } from "zod";
import {
	TenantModeProviderSchema,
	TenantModeSchema,
	type TenantMode,
	type TenantModeProvider,
} from "./guardrail";

// ─── Phase C contract shapes ───────────────────────────────────────────────
//
// These types describe the future `POST /projects/:id/security/tenant-mode`
// endpoint contract (per docs/guides/provider-capabilities-and-rollout.md,
// Phase C). They are pure type/data definitions so the API and Dashboard can
// consume the same shapes. No server routes are defined here.

/**
 * Request body for enabling/configuring tenant mode on a project.
 * Mirrors the tenant-mode portion of {@link TenantMode} but all fields are
 * optional so callers can patch individual settings.
 */
export const SetTenantModeRequestSchema = z.object({
	enabled: z.boolean().optional(),
	tenantColumn: z.string().min(1).optional(),
	strict: z.boolean().optional(),
	provider: TenantModeProviderSchema.optional(),
});

export type SetTenantModeRequest = z.infer<typeof SetTenantModeRequestSchema>;

/**
 * Effective tenant-mode status returned by the contract endpoint.
 * `enforcedAt` reflects where tenant scoping is enforced: "database" when
 * database-level enforcement (RLS) is active, "application" when
 * application-level enforcement is used, and null when tenant mode is disabled.
 */
export interface TenantModeStatus {
	enabled: boolean;
	tenantColumn: string;
	strict: boolean;
	provider?: TenantModeProvider;
	enforcedAt: "application" | "database" | null;
}

/**
 * Project a {@link TenantMode} config into a {@link TenantModeStatus}.
 * `enforcedAt` is "database" when the provider supports RLS, else
 * "application" (the guardrail engine enforces in code).
 */
export function toTenantModeStatus(
	mode: TenantMode,
	supportsRls: boolean,
): TenantModeStatus {
	return {
		enabled: mode.enabled,
		tenantColumn: mode.tenantColumn,
		strict: mode.strict,
		provider: mode.provider,
		enforcedAt: mode.enabled ? (supportsRls ? "database" : "application") : null,
	};
}
