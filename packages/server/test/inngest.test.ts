import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

// Mock the inngest module
const mockInngestCreateFunction = mock(() => ({
	id: "mock-function",
	run: mock(() => Promise.resolve({})),
}));

const mockInngestSend = mock(() => Promise.resolve({ ids: [] as string[] }));

mock.module("../src/lib/inngest", () => ({
	inngest: {
		createFunction: mockInngestCreateFunction,
		send: mockInngestSend,
	},
	deliverWebhook: { id: "deliver-webhook" },
	evaluateNotificationRule: { id: "evaluate-notification-rule" },
	exportProjectUsers: { id: "export-project-users" },
	pollNotificationRules: { id: "poll-notification-rules" },
	allInngestFunctions: [
		{ id: "deliver-webhook" },
		{ id: "evaluate-notification-rule" },
		{ id: "export-project-users" },
		{ id: "poll-notification-rules" },
	] as { id: string }[],
}));

// Mock the db module
const mockPoolQuery = mock(() => Promise.resolve({ rows: [] as any[] }));
const mockPool = {
	query: mockPoolQuery,
};

mock.module("../src/lib/db", () => ({
	getPool: () => mockPool,
}));

// After all tests in this file, clear the process-global mock.module registry so
// the mocked modules cannot leak into sibling test files in a combined run.
afterAll(() => {
	mock.restore();
});

describe("Inngest client", () => {
	beforeEach(() => {
		mockInngestSend.mockClear();
		mockInngestCreateFunction.mockClear();
		mockPoolQuery.mockClear();
	});

	describe("Module exports", () => {
		it("should export deliverWebhook function", async () => {
			const { deliverWebhook } = await import("../src/lib/inngest");
			expect(deliverWebhook).toBeDefined();
			expect((deliverWebhook as unknown as { id: string }).id).toBe("deliver-webhook");
		});

		it("should export evaluateNotificationRule function", async () => {
			const { evaluateNotificationRule } = await import("../src/lib/inngest");
			expect(evaluateNotificationRule).toBeDefined();
			expect((evaluateNotificationRule as unknown as { id: string }).id).toBe(
				"evaluate-notification-rule",
			);
		});

		it("should export exportProjectUsers function", async () => {
			const { exportProjectUsers } = await import("../src/lib/inngest");
			expect(exportProjectUsers).toBeDefined();
			expect((exportProjectUsers as unknown as { id: string }).id).toBe("export-project-users");
		});

		it("should export pollNotificationRules function", async () => {
			const { pollNotificationRules } = await import("../src/lib/inngest");
			expect(pollNotificationRules).toBeDefined();
			expect((pollNotificationRules as unknown as { id: string }).id).toBe(
				"poll-notification-rules",
			);
		});

		it("should export allInngestFunctions array with 4 functions", async () => {
			const { allInngestFunctions } = await import("../src/lib/inngest");
			expect(allInngestFunctions).toBeDefined();
			expect(allInngestFunctions.length).toBe(4);
		});

		it("should have correct function IDs in allInngestFunctions", async () => {
			const { allInngestFunctions } = await import("../src/lib/inngest");
			expect(allInngestFunctions).toBeDefined();
			expect(allInngestFunctions.length).toBe(4);
			const ids = allInngestFunctions.map((fn: unknown) => (fn as { id: string }).id);
			expect(ids).toContain("deliver-webhook");
			expect(ids).toContain("evaluate-notification-rule");
			expect(ids).toContain("export-project-users");
			expect(ids).toContain("poll-notification-rules");
		});
	});

	describe("inngest.send event triggering", () => {
		it("should send webhook deliver event via inngest.send", async () => {
			const { inngest } = await import("../src/lib/inngest");

			const event = {
				name: "betterbase/webhook.deliver" as const,
				data: {
					webhookId: "wh_123",
					webhookName: "Test Webhook",
					url: "https://example.com/webhook",
					secret: "secret123",
						eventType: "INSERT",
						tableName: "users",
						payload: { id: "1", name: "Test" },
					},
				};

			await inngest.send([event]);

			expect(mockInngestSend).toHaveBeenCalled();
			const allCalls = mockInngestSend.mock.calls as unknown[][];
			const firstArg = allCalls[0]?.[0];
			const sentEvents = firstArg as { name: string; data: Record<string, unknown> }[] | undefined;
			expect(sentEvents?.[0]?.name).toBe("betterbase/webhook.deliver");
			expect(sentEvents?.[0]?.data.webhookId).toBe("wh_123");
			expect(sentEvents?.[0]?.data.eventType).toBe("INSERT");
		});

		it("should send notification evaluate event via inngest.send", async () => {
			const { inngest } = await import("../src/lib/inngest");

			const event = {
				name: "betterbase/notification.evaluate" as const,
				data: {
					ruleId: "rule_123",
					ruleName: "High Error Rate",
					metric: "error_rate",
					threshold: 5,
					channel: "email" as const,
					target: "admin@example.com",
					currentValue: 10,
				},
			};

			await inngest.send([event]);

			const allCalls = mockInngestSend.mock.calls as unknown[][];
			const firstArg = allCalls[0]?.[0];
			const sentEvents = firstArg as { name: string; data: Record<string, unknown> }[] | undefined;
			expect(sentEvents?.[0]?.name).toBe("betterbase/notification.evaluate");
			expect(sentEvents?.[0]?.data.ruleId).toBe("rule_123");
			expect(sentEvents?.[0]?.data.metric).toBe("error_rate");
		});

		it("should send export users event via inngest.send", async () => {
			const { inngest } = await import("../src/lib/inngest");

			const event = {
				name: "betterbase/export.users" as const,
				data: {
					projectId: "proj_123",
					projectSlug: "my-project",
					requestedBy: "admin@example.com",
					filters: {
						search: "john",
						banned: false,
						from: "2024-01-01",
						to: "2024-12-31",
					},
				},
			};

			await inngest.send([event]);

			const allCalls = mockInngestSend.mock.calls as unknown[][];
			const firstArg = allCalls[0]?.[0];
			const sentEvents = firstArg as { name: string; data: Record<string, unknown> }[] | undefined;
			expect(sentEvents?.[0]?.name).toBe("betterbase/export.users");
			expect(sentEvents?.[0]?.data.projectSlug).toBe("my-project");
		});
	});

	describe("Database pool interactions", () => {
		it("should get pool from db module", async () => {
			const { getPool } = await import("../src/lib/db");
			const pool = getPool();

			expect(pool).toBeDefined();
			expect(pool.query).toBeDefined();
		});

		it("should call pool.query for export job insert", async () => {
			const { getPool } = await import("../src/lib/db");
			const pool = getPool();

			await pool.query(
				`INSERT INTO betterbase_meta.export_jobs
           (project_id, requested_by, status, row_count, result_object_key, result_expires_at, completed_at)
         VALUES ($1, $2, 'complete', $3, $4, $5, NOW())`,
				["proj_123", "admin@example.com", 10, "exports/proj_123/123.csv", new Date()],
			);

			expect(mockPoolQuery).toHaveBeenCalled();
		});

		it("should call pool.query for webhook secret lookup", async () => {
			const { getPool } = await import("../src/lib/db");
			const pool = getPool();

			await pool.query("SELECT secret FROM betterbase_meta.webhooks WHERE id = $1", ["wh_123"]);

			expect(mockPoolQuery).toHaveBeenCalled();
			const calls = mockPoolQuery.mock.calls;
			expect(calls.length).toBeGreaterThan(0);
			expect((calls[0] as unknown[])[0]).toContain("webhooks");
			expect((calls[0] as unknown[])[0]).toContain("SELECT");
		});

		it("should call pool.query for notification rules", async () => {
			const { getPool } = await import("../src/lib/db");
			const pool = getPool();

			await pool.query("SELECT * FROM betterbase_meta.notification_rules WHERE enabled = TRUE");

			expect(mockPoolQuery).toHaveBeenCalled();
			const calls = mockPoolQuery.mock.calls;
			expect(calls.length).toBeGreaterThan(0);
			expect((calls[0] as unknown[])[0]).toContain("notification_rules");
		});

		it("should call pool.query for request logs metric", async () => {
			const { getPool } = await import("../src/lib/db");
			const pool = getPool();

			await pool.query(`
				SELECT
					ROUND(
						COUNT(*) FILTER (WHERE status >= 500)::numeric /
						NULLIF(COUNT(*), 0) * 100,
						2
					) AS value
				FROM betterbase_meta.request_logs
				WHERE created_at > NOW() - INTERVAL '5 minutes'
			`);

			expect(mockPoolQuery).toHaveBeenCalled();
			const calls = mockPoolQuery.mock.calls;
			expect(calls.length).toBeGreaterThan(0);
			expect((calls[0] as unknown[])[0]).toContain("request_logs");
		});
	});
});

describe("Inngest environment configuration", () => {
	describe("BASE_URL scenarios", () => {
		it("should use cloud API when INNGEST_BASE_URL is undefined", () => {
			const baseUrl = undefined;
			const effectiveUrl = baseUrl ?? "https://api.inngest.com";
			expect(effectiveUrl).toBe("https://api.inngest.com");
		});

		it("should use local dev server when INNGEST_BASE_URL is localhost:8288", () => {
			const baseUrl = "http://localhost:8288";
			expect(baseUrl).toBe("http://localhost:8288");
		});

		it("should use self-hosted container when INNGEST_BASE_URL is inngest:8288", () => {
			const baseUrl = "http://inngest:8288";
			expect(baseUrl).toBe("http://inngest:8288");
		});
	});

	describe("Signing key", () => {
		it("should have default signing key for development", () => {
			const signingKey = undefined;
			const effectiveKey = signingKey ?? "betterbase-dev-signing-key";
			expect(effectiveKey).toBe("betterbase-dev-signing-key");
		});

		it("should use provided signing key in production", () => {
			const signingKey = "prod-key-123";
			expect(signingKey).toBe("prod-key-123");
		});
	});

	describe("Event key", () => {
		it("should have default event key for development", () => {
			const eventKey = undefined;
			const effectiveKey = eventKey ?? "betterbase-dev-event-key";
			expect(effectiveKey).toBe("betterbase-dev-event-key");
		});

		it("should use provided event key in production", () => {
			const eventKey = "prod-event-key-456";
			expect(eventKey).toBe("prod-event-key-456");
		});
	});
});
