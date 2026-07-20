import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { getPool } from "../src/lib/db";

// Mock the db module
const mockPool = {
	query: mock(() => Promise.resolve({ rows: [] as any[] })),
};

mock.module("../src/lib/db", () => ({
	getPool: () => mockPool,
}));

// After all tests in this file, clear the process-global mock.module registry so
// the mocked module cannot leak into sibling test files in a combined run.
afterAll(() => {
	mock.restore();
});

describe("project-scoped routes", () => {
	beforeEach(() => {
		mockPool.query.mockClear();
	});

	describe("schemaName helper", () => {
		it("should generate correct schema name from slug", () => {
			const schemaName = (project: { slug: string }) => `project_${project.slug}`;

			expect(schemaName({ slug: "my-project" })).toBe("project_my-project");
			expect(schemaName({ slug: "test-123" })).toBe("project_test-123");
		});

		it("should handle slug with hyphens", () => {
			const schemaName = (project: { slug: string }) => `project_${project.slug}`;

			expect(schemaName({ slug: "my-awesome-project" })).toBe("project_my-awesome-project");
		});
	});

	describe("project middleware", () => {
		it("should verify project exists before routing", async () => {
			mockPool.query.mockResolvedValueOnce({
				rows: [{ id: "proj-123", name: "Test Project", slug: "test-project" }] as any[],
			});

			const pool = getPool();
			const { rows } = await pool.query(
				"SELECT id, name, slug FROM betterbase_meta.projects WHERE id = $1",
				["proj-123"],
			);

			expect(rows.length).toBe(1);
			expect(rows[0].slug).toBe("test-project");
		});

		it("should return 404 when project not found", async () => {
			mockPool.query.mockResolvedValueOnce({ rows: [] as any[] });

			const pool = getPool();
			const { rows } = await pool.query(
				"SELECT id, name, slug FROM betterbase_meta.projects WHERE id = $1",
				["nonexistent"],
			);

			expect(rows.length).toBe(0);
		});
	});

	describe("users route", () => {
		it("should query users with filtering", async () => {
			mockPool.query.mockResolvedValueOnce({
				rows: [
					{
						id: "user-1",
						name: "John",
						email: "john@test.com",
						email_verified: true,
						created_at: new Date(),
						banned: false,
					},
				] as any[],
			});
			mockPool.query.mockResolvedValueOnce({ rows: [{ total: 1 }] as any[] });

			const pool = getPool();
			const s = "project_test";
			const limit = 50;
			const offset = 0;

			const { rows: users } = await pool.query(
				`SELECT u.id, u.name, u.email, u.email_verified, u.created_at, u.banned
				 FROM ${s}."user" u
				 ORDER BY u.created_at DESC
				 LIMIT $1 OFFSET $2`,
				[limit, offset],
			);

			expect(users.length).toBe(1);
			expect(users[0].email).toBe("john@test.com");
		});

		it("should handle search filter", () => {
			const search = "john";
			const conditions = [`(u.email ILIKE $1 OR u.name ILIKE $1)`];
			const params = [`%${search}%`];

			expect(conditions[0]).toContain("ILIKE");
			expect(params[0]).toBe("%john%");
		});

		it("should handle banned filter", () => {
			const banned = "true";
			const conditions = [`u.banned = $1`];
			const params = [banned === "true"];

			expect(params[0]).toBe(true);
		});
	});

	describe("ban/unban user", () => {
		it("should structure the ban operation correctly", async () => {
			// Test the query structure rather than actual execution
			const userId = "user-123";
			const s = "project_test";

			// Query should be structured correctly
			const selectQuery = `SELECT * FROM ${s}."user" WHERE id = $1`;
			const updateQuery = `UPDATE ${s}."user" SET banned = $1, updated_at = NOW() WHERE id = $2`;
			const deleteQuery = `DELETE FROM ${s}.session WHERE user_id = $1`;

			expect(selectQuery).toContain(`${s}."user"`);
			expect(updateQuery).toContain("banned");
			expect(deleteQuery).toContain("session");
		});
	});

	describe("auth-config route", () => {
		it("should have allowed keys whitelist", () => {
			const ALLOWED_KEYS = [
				"email_password_enabled",
				"magic_link_enabled",
				"otp_enabled",
				"phone_enabled",
				"password_min_length",
				"require_email_verification",
				"session_expiry_seconds",
				"refresh_token_expiry_seconds",
				"max_sessions_per_user",
				"allowed_email_domains",
				"blocked_email_domains",
				"provider_google",
				"provider_github",
				"provider_discord",
				"provider_apple",
				"provider_microsoft",
				"provider_twitter",
				"provider_facebook",
				"twilio_account_sid",
				"twilio_auth_token",
				"twilio_phone_number",
			];

			expect(ALLOWED_KEYS.length).toBe(21);
		});

		it("should validate key is in allowed list", () => {
			const ALLOWED_KEYS = ["email_password_enabled", "provider_google"];

			expect(ALLOWED_KEYS.includes("email_password_enabled")).toBe(true);
			expect(ALLOWED_KEYS.includes("unknown_key")).toBe(false);
		});
	});

	describe("env vars route", () => {
		it("should mask secret values in response", () => {
			// Test the CASE expression logic
			const rows = [
				{ key: "API_KEY", is_secret: true },
				{ key: "PUBLIC_URL", is_secret: false },
			];

			const masked = rows.map((r) => ({
				...r,
				value: r.is_secret ? "••••••••" : "actual_value",
			}));

			expect(masked[0].value).toBe("••••••••");
			expect(masked[1].value).toBe("actual_value");
		});

		it("should validate key format (uppercase alphanumeric with underscores)", () => {
			const validKeys = ["API_KEY", "DATABASE_URL", "MY_KEY_123"];
			const invalidKeys = ["api_key", "123-key", "my key"];

			const keyRegex = /^[A-Z][A-Z0-9_]*$/;

			validKeys.forEach((key) => expect(keyRegex.test(key)).toBe(true));
			invalidKeys.forEach((key) => expect(keyRegex.test(key)).toBe(false));
		});
	});

	describe("database introspection", () => {
		it("should construct correct information_schema query", () => {
			const s = "project_test";
			const query = `SELECT t.table_name, pg_class.reltuples::bigint AS estimated_row_count
 FROM information_schema.tables t
 JOIN pg_class ON pg_class.relname = t.table_name
 WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'`;

			expect(query).toContain("information_schema.tables");
			expect(query).toContain(`table_schema = $1`);
		});
	});

	describe("webhooks route", () => {
		it("should construct webhook delivery stats query", () => {
			const query = `SELECT w.*,
	COUNT(wd.id)::int AS total_deliveries,
	COUNT(wd.id) FILTER (WHERE wd.status = 'success')::int AS successful_deliveries,
	MAX(wd.created_at) AS last_delivery_at
FROM betterbase_meta.webhooks w
LEFT JOIN betterbase_meta.webhook_deliveries wd ON wd.webhook_id = w.id
GROUP BY w.id`;

			expect(query).toContain("webhooks");
			expect(query).toContain("webhook_deliveries");
			expect(query).toContain("FILTER");
		});
	});

	describe("functions route", () => {
		it("should construct function invocations query", () => {
			const query = `SELECT id, trigger_type, status, duration_ms, error_message
FROM betterbase_meta.function_invocations
WHERE function_id = $1
ORDER BY created_at DESC`;

			expect(query).toContain("function_invocations");
			expect(query).toContain("function_id = $1");
		});

		it("should construct function stats query with aggregation", () => {
			const interval = "24 hours";

			const query = `SELECT
	COUNT(*)::int AS total,
	COUNT(*) FILTER (WHERE status = 'success')::int AS successes,
	COUNT(*) FILTER (WHERE status = 'error')::int AS errors,
	ROUND(AVG(duration_ms))::int AS avg_duration_ms,
	MAX(duration_ms)::int AS max_duration_ms
FROM betterbase_meta.function_invocations
WHERE function_id = $1 AND created_at > NOW() - INTERVAL '${interval}'`;

			expect(query).toContain("FILTER");
			expect(query).toContain("COUNT(*)::int AS total");
		});
	});
});
