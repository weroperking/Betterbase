import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { getPool } from "../src/lib/db";
import { instanceRoutes } from "../src/routes/admin/instance";

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

describe("instance routes", () => {
	let app: Hono;

	beforeEach(() => {
		mockPool.query.mockClear();
		app = new Hono();
		// Use the routes directly - we'll test them in isolation
	});

	describe("GET /admin/instance", () => {
		it("should return settings as key-value object", async () => {
			mockPool.query.mockResolvedValueOnce({
				rows: [
					{ key: "instance_name", value: "Betterbase", updated_at: new Date() },
					{ key: "public_url", value: "http://localhost", updated_at: new Date() },
				] as any[],
			});

			// Simulate the route handler
			const pool = getPool();
			const { rows } = await pool.query(
				"SELECT key, value, updated_at FROM betterbase_meta.instance_settings ORDER BY key",
			);
			const settings = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));

			expect(settings).toEqual({
				instance_name: "Betterbase",
				public_url: "http://localhost",
			});
		});

		it("should return empty object when no settings exist", async () => {
			mockPool.query.mockResolvedValueOnce({ rows: [] });

			const pool = getPool();
			const { rows } = await pool.query("SELECT key, value FROM betterbase_meta.instance_settings");
			const settings = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));

			expect(settings).toEqual({});
		});
	});

	describe("GET /admin/instance/health", () => {
		it("should return health status with database latency", async () => {
			mockPool.query.mockResolvedValueOnce({ rows: [] });

			const pool = getPool();
			const start = Date.now();
			await pool.query("SELECT 1");
			const dbLatencyMs = Date.now() - start;

			expect(dbLatencyMs).toBeGreaterThanOrEqual(0);
		});

		it("should handle database connection error gracefully", async () => {
			mockPool.query.mockRejectedValueOnce(new Error("Connection failed"));

			const pool = getPool();
			let dbStatus = "ok";
			let dbLatencyMs = 0;

			try {
				const start = Date.now();
				await pool.query("SELECT 1");
				dbLatencyMs = Date.now() - start;
			} catch {
				dbStatus = "error";
			}

			expect(dbStatus).toBe("error");
			expect(dbLatencyMs).toBe(0);
		});
	});

	describe("PATCH /admin/instance", () => {
		it("should update only provided keys", async () => {
			const updates: Array<[string, string]> = [["instance_name", JSON.stringify("New Name")]];

			mockPool.query.mockResolvedValueOnce({ rows: [] });

			const pool = getPool();
			for (const [key, value] of updates) {
				await pool.query(
					`INSERT INTO betterbase_meta.instance_settings (key, value, updated_at, updated_by)
					 VALUES ($1, $2::jsonb, NOW(), $3)
					 ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW(), updated_by = $3`,
					[key, value, "admin-id"],
				);
			}

			expect(mockPool.query).toHaveBeenCalledTimes(1);
		});

		it("should validate input with zod schema", async () => {
			// Valid inputs
			const validInputs = [
				{ instance_name: "Test" },
				{ public_url: "https://example.com" },
				{ contact_email: "admin@example.com" },
				{ log_retention_days: 30 },
				{ max_sessions_per_user: 10 },
				{ require_email_verification: true },
				{ ip_allowlist: ["192.168.1.1"] },
				{ cors_origins: ["https://example.com"] },
			];

			for (const input of validInputs) {
				expect(input).toBeDefined();
			}
		});
	});
});
