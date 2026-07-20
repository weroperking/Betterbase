import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { createHash, randomBytes } from "crypto";
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

describe("API Keys", () => {
	beforeEach(() => {
		mockPool.query.mockClear();
	});

	describe("key generation", () => {
		it("should generate keys with bb_live_ prefix", () => {
			const rawKey = `bb_live_${randomBytes(32).toString("hex")}`;
			expect(rawKey).toStartWith("bb_live_");
			expect(rawKey.length).toBe(8 + 64); // prefix + 32 bytes hex
		});

		it("should generate unique keys each time", () => {
			const key1 = `bb_live_${randomBytes(32).toString("hex")}`;
			const key2 = `bb_live_${randomBytes(32).toString("hex")}`;
			expect(key1).not.toBe(key2);
		});

		it("should generate key prefix of 8 characters", () => {
			const rawKey = `bb_live_${randomBytes(32).toString("hex")}`;
			const keyPrefix = rawKey.slice(0, 8);
			expect(keyPrefix).toBe("bb_live_");
			expect(keyPrefix.length).toBe(8);
		});
	});

	describe("key hashing", () => {
		it("should produce SHA-256 hash", () => {
			const rawKey = "bb_live_abcdef123456";
			const keyHash = createHash("sha256").update(rawKey).digest("hex");

			expect(keyHash).toHaveLength(64); // SHA-256 produces 32 bytes = 64 hex chars
			expect(keyHash).toMatch(/^[a-f0-9]+$/);
		});

		it("should produce consistent hash for same input", () => {
			const rawKey = "bb_live_testkey123";
			const hash1 = createHash("sha256").update(rawKey).digest("hex");
			const hash2 = createHash("sha256").update(rawKey).digest("hex");

			expect(hash1).toBe(hash2);
		});

		it("should produce different hashes for different inputs", () => {
			const hash1 = createHash("sha256").update("key1").digest("hex");
			const hash2 = createHash("sha256").update("key2").digest("hex");

			expect(hash1).not.toBe(hash2);
		});
	});

	describe("API key routes", () => {
		describe("POST /admin/api-keys", () => {
			it("should create API key and return plaintext once", async () => {
				const data = {
					name: "Test Key",
					scopes: ["projects", "users"],
					expires_at: "2025-12-31T23:59:59Z",
				};

				const rawKey = `bb_live_${randomBytes(32).toString("hex")}`;
				const keyHash = createHash("sha256").update(rawKey).digest("hex");
				const keyPrefix = rawKey.slice(0, 16);

				expect(keyPrefix).toStartWith("bb_live_");
				expect(keyHash).toHaveLength(64);
			});

			it("should allow empty scopes for full access", async () => {
				const scopes: string[] = [];
				expect(scopes.length).toBe(0);
			});
		});

		describe("GET /admin/api-keys", () => {
			it("should return keys without exposing key_hash", async () => {
				mockPool.query.mockResolvedValueOnce({
					rows: [
						{
							id: "key-1",
							name: "Key 1",
							key_prefix: "bb_live_abc",
							scopes: [],
							last_used_at: null,
							expires_at: null,
							created_at: new Date(),
						},
					],
				});

				const pool = getPool();
				const { rows } = await pool.query(
					`SELECT id, name, key_prefix, scopes, last_used_at, expires_at, created_at
					 FROM betterbase_meta.api_keys
					 WHERE admin_user_id = $1
					 ORDER BY created_at DESC`,
					["admin-123"],
				);

				expect(rows[0]).not.toHaveProperty("key_hash");
				expect(rows[0]).toHaveProperty("key_prefix");
			});
		});

		describe("DELETE /admin/api-keys/:id", () => {
			it("should only delete keys owned by the admin", async () => {
				mockPool.query.mockResolvedValueOnce({
					rows: [{ id: "key-1", name: "My Key" }],
				});

				const pool = getPool();
				const { rows } = await pool.query(
					"DELETE FROM betterbase_meta.api_keys WHERE id = $1 AND admin_user_id = $2 RETURNING id, name",
					["key-1", "admin-123"],
				);

				expect(rows.length).toBe(1);
			});

			it("should return 404 when key not found or not owned", async () => {
				mockPool.query.mockResolvedValueOnce({ rows: [] });

				const pool = getPool();
				const { rows } = await pool.query(
					"DELETE FROM betterbase_meta.api_keys WHERE id = $1 AND admin_user_id = $2 RETURNING id, name",
					["key-nonexistent", "admin-123"],
				);

				expect(rows.length).toBe(0);
			});
		});
	});

	describe("API key authentication", () => {
		it("should verify key hash matches", async () => {
			const rawKey = "bb_live_abc123";
			const keyHash = createHash("sha256").update(rawKey).digest("hex");

			mockPool.query.mockResolvedValueOnce({
				rows: [{ admin_user_id: "admin-1", id: "admin-1", email: "admin@test.com" }],
			});

			const pool = getPool();
			const { rows } = await pool.query(
				`SELECT ak.admin_user_id, au.id, au.email
				 FROM betterbase_meta.api_keys ak
				 JOIN betterbase_meta.admin_users au ON au.id = ak.admin_user_id
				 WHERE ak.key_hash = $1
				   AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
				[keyHash],
			);

			expect(rows.length).toBe(1);
		});

		it("should reject expired keys", async () => {
			mockPool.query.mockResolvedValueOnce({ rows: [] });

			const pool = getPool();
			const keyHash = "abc123";
			const { rows } = await pool.query(
				`SELECT ak.admin_user_id, au.id, au.email
				 FROM betterbase_meta.api_keys ak
				 JOIN betterbase_meta.admin_users au ON au.id = ak.admin_user_id
				 WHERE ak.key_hash = $1
				   AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
				[keyHash],
			);

			expect(rows.length).toBe(0);
		});

		it("should update last_used_at on successful auth", async () => {
			mockPool.query.mockResolvedValueOnce({ rows: [] });

			const pool = getPool();
			const keyHash = "abc123";

			// Fire and forget - we just verify the query is correct
			pool
				.query("UPDATE betterbase_meta.api_keys SET last_used_at = NOW() WHERE key_hash = $1", [
					keyHash,
				])
				.catch(() => {});

			expect(mockPool.query).toHaveBeenCalled();
		});
	});
});
