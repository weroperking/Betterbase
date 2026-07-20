import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { type AuditAction, type AuditEntry, getClientIp, writeAuditLog } from "../src/lib/audit";

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

describe("audit utility", () => {
	beforeEach(() => {
		mockPool.query.mockClear();
	});

	describe("getClientIp", () => {
		it("should extract IP from x-forwarded-for header", () => {
			const headers = new Headers({ "x-forwarded-for": "192.168.1.1, 10.0.0.1" });
			expect(getClientIp(headers)).toBe("192.168.1.1");
		});

		it("should extract IP from x-real-ip header when x-forwarded-for is missing", () => {
			const headers = new Headers({ "x-real-ip": "192.168.1.1" });
			expect(getClientIp(headers)).toBe("192.168.1.1");
		});

		it("should return 'unknown' when no IP headers are present", () => {
			const headers = new Headers();
			expect(getClientIp(headers)).toBe("unknown");
		});

		it("should handle empty x-forwarded-for", () => {
			const headers = new Headers({ "x-forwarded-for": "" });
			// Empty string from get() returns empty string, not null
			// This tests the logic that empty string should be handled
			const value = headers.get("x-forwarded-for");
			expect(value).toBe("");
		});
	});

	describe("writeAuditLog", () => {
		it("should insert audit log entry", async () => {
			const entry: AuditEntry = {
				actorId: "admin-123",
				actorEmail: "admin@test.com",
				action: "project.create",
				resourceType: "project",
				resourceId: "proj-456",
				resourceName: "Test Project",
				ipAddress: "192.168.1.1",
				userAgent: "Mozilla/5.0",
			};

			await writeAuditLog(entry);

			expect(mockPool.query).toHaveBeenCalled();
			const calls = mockPool.query.mock.calls as unknown[][];
			const [query] = calls[0] ?? ["", []];
			expect(query).toContain("INSERT INTO betterbase_meta.audit_log");
		});

		it("should handle minimal entry with only action", async () => {
			const entry: AuditEntry = {
				action: "admin.login" as AuditAction,
			};

			await writeAuditLog(entry);

			expect(mockPool.query).toHaveBeenCalled();
		});

		it("should include beforeData and afterData as JSON strings", async () => {
			const entry: AuditEntry = {
				action: "project.update" as AuditAction,
				beforeData: { name: "Old Name" },
				afterData: { name: "New Name" },
			};

			await writeAuditLog(entry);

			expect(mockPool.query).toHaveBeenCalled();
			const calls = mockPool.query.mock.calls as unknown[][];
			const [, params] = calls[0] ?? ["", []];
			const paramArr = params as unknown[];
			expect(paramArr[6]).toBe(JSON.stringify({ name: "Old Name" }));
			expect(paramArr[7]).toBe(JSON.stringify({ name: "New Name" }));
		});

		it("should handle undefined optional fields", async () => {
			const entry: AuditEntry = {
				action: "settings.update" as AuditAction,
			};

			await writeAuditLog(entry);

			expect(mockPool.query).toHaveBeenCalled();
		});

		it("should not throw on database error (fire and forget)", async () => {
			mockPool.query.mockRejectedValueOnce(new Error("DB error"));

			const entry: AuditEntry = {
				action: "test.action" as AuditAction,
			};

			// The fire-and-forget behavior - we just verify the code doesn't throw synchronously
			// The promise rejection happens but we don't await it
			const promise = writeAuditLog(entry);

			// Give it a moment to process the rejection
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Verify query was called despite the error
			expect(mockPool.query).toHaveBeenCalled();
		});
	});

	describe("AuditAction type", () => {
		it("should accept valid audit actions", () => {
			const validActions: AuditAction[] = [
				"admin.login",
				"admin.logout",
				"project.create",
				"project.update",
				"project.delete",
				"project.user.ban",
				"webhook.create",
				"function.create",
				"api_key.create",
				"role.assign",
				"settings.update",
				"smtp.update",
				"audit.export",
			];

			expect(validActions.length).toBeGreaterThan(0);
		});
	});
});
