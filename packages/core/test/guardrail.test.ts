import { describe, expect, it } from "bun:test";
import { PostgresProviderAdapter, TursoProviderAdapter } from "../src/providers/index";
import {
	GuardrailEngine,
	GuardrailViolationError,
	createGuardrailEngine,
	TenantModeSchema,
} from "../src/providers/guardrail";
import { toTenantModeStatus, SetTenantModeRequestSchema } from "../src/providers/tenant-mode";

const enabledMode = TenantModeSchema.parse({ enabled: true, tenantColumn: "tenant_id" });
const strictMode = TenantModeSchema.parse({ enabled: true, strict: true });

describe("GuardrailEngine (Phase B)", () => {
	it("rejects an unscoped write on a multi-tenant table", () => {
		const engine = new GuardrailEngine(new PostgresProviderAdapter(), enabledMode);
		expect(() => engine.enforceWrite("invoices")).toThrow(GuardrailViolationError);
	});

	it("allows a write when tenantId is supplied", () => {
		const engine = new GuardrailEngine(new PostgresProviderAdapter(), enabledMode);
		expect(() => engine.enforceWrite("invoices", { tenantId: "t1" })).not.toThrow();
	});

	it("allows a write when hasTenantFilter is true", () => {
		const engine = new GuardrailEngine(new PostgresProviderAdapter(), enabledMode);
		expect(() =>
			engine.enforceWrite("invoices", { hasTenantFilter: true }),
		).not.toThrow();
	});

	it("allows unscoped read when not strict", () => {
		const engine = new GuardrailEngine(new PostgresProviderAdapter(), enabledMode);
		expect(() => engine.enforceRead("invoices")).not.toThrow();
	});

	it("rejects unscoped read when strict", () => {
		const engine = new GuardrailEngine(new PostgresProviderAdapter(), strictMode);
		expect(() => engine.enforceRead("invoices")).toThrow(GuardrailViolationError);
	});

	it("allows scoped read when strict + tenantId", () => {
		const engine = new GuardrailEngine(new PostgresProviderAdapter(), strictMode);
		expect(() =>
			engine.enforceRead("invoices", { tenantId: "t1" }),
		).not.toThrow();
	});

	it("passthrough when tenant mode disabled", () => {
		const engine = new GuardrailEngine(
			new PostgresProviderAdapter(),
			TenantModeSchema.parse({ enabled: false }),
		);
		expect(() => engine.enforceWrite("invoices")).not.toThrow();
	});

	it("respects exempt tables", () => {
		const engine = new GuardrailEngine(
			new PostgresProviderAdapter(),
			enabledMode,
		);
		expect(() =>
			engine.enforceWrite("global_config", { exemptTables: ["global_config"] }),
		).not.toThrow();
	});

	it("allows bypass with reason and audits", () => {
		const engine = new GuardrailEngine(new PostgresProviderAdapter(), enabledMode);
		expect(() =>
			engine.enforceWrite("invoices", { bypass: true, bypassReason: "maint" }),
		).not.toThrow();
	});

	it("enforces at app layer even when provider has no RLS (logs warning)", () => {
		const engine = new GuardrailEngine(new TursoProviderAdapter(), enabledMode);
		expect(() => engine.enforceWrite("invoices")).toThrow(GuardrailViolationError);
		expect(() =>
			engine.enforceWrite("invoices", { tenantId: "t1" }),
		).not.toThrow();
	});

	it("createGuardrailEngine returns null when disabled", () => {
		expect(
			createGuardrailEngine(new PostgresProviderAdapter(), { enabled: false }),
		).toBeNull();
		expect(
			createGuardrailEngine(new PostgresProviderAdapter(), enabledMode),
		).not.toBeNull();
	});

	it("withTenant returns a bound context", () => {
		const engine = new GuardrailEngine(new PostgresProviderAdapter(), enabledMode);
		expect(engine.withTenant(null, "t1")).toEqual({ tenantId: "t1" });
	});
});

describe("TenantMode contract (Phase C prep)", () => {
	it("SetTenantModeRequestSchema is a partial patch shape", () => {
		expect(SetTenantModeRequestSchema.safeParse({ strict: true }).success).toBe(true);
		expect(SetTenantModeRequestSchema.safeParse({}).success).toBe(true);
	});

	it("toTenantModeStatus reflects database enforcement for RLS providers", () => {
		const status = toTenantModeStatus(enabledMode, true);
		expect(status.enforcedAt).toBe("database");
	});

	it("toTenantModeStatus reflects application enforcement for non-RLS providers", () => {
		const status = toTenantModeStatus(enabledMode, false);
		expect(status.enforcedAt).toBe("application");
	});

	it("toTenantModeStatus is null when disabled", () => {
		const status = toTenantModeStatus(
			TenantModeSchema.parse({ enabled: false }),
			true,
		);
		expect(status.enforcedAt).toBeNull();
	});
});
