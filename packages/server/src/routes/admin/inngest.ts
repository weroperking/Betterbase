import { Hono } from "hono";
import { getPool } from "../../lib/db";

export const inngestAdminRoutes = new Hono();

const getInngestBaseUrl = async (): Promise<string> => {
	const envUrl = process.env.INNGEST_BASE_URL;
	if (envUrl) return envUrl;

	const pool = getPool();
	const { rows } = await pool.query(
		"SELECT value FROM betterbase_meta.instance_settings WHERE key = 'inngest_base_url'",
	);
	const storedValue = rows[0]?.value;
	const url = typeof storedValue === "string" ? storedValue : (storedValue?.value ?? null);
	return url || "https://api.inngest.com";
};

const getInngestHeaders = async (): Promise<HeadersInit> => {
	const pool = getPool();
	const { rows } = await pool.query(
		"SELECT value FROM betterbase_meta.instance_settings WHERE key = 'inngest_api_key'",
	);
	// Handle JSON string values from instance_settings
	const storedValue = rows[0]?.value;
	const apiKey =
		typeof storedValue === "string"
			? storedValue
			: (storedValue?.value ?? process.env.INNGEST_API_KEY ?? "");
	return {
		"Content-Type": "application/json",
		...(apiKey && { Authorization: `Bearer ${apiKey}` }),
	};
};

const getInngestEnv = async (): Promise<string | null> => {
	const pool = getPool();
	const { rows } = await pool.query(
		"SELECT value FROM betterbase_meta.instance_settings WHERE key = 'inngest_env_id'",
	);
	const storedValue = rows[0]?.value;
	return typeof storedValue === "string" ? storedValue : (storedValue?.value ?? null);
};

const isSelfHosted = async (): Promise<boolean> => {
	const baseUrl = await getInngestBaseUrl();
	return baseUrl !== "https://api.inngest.com";
};

// Helper to check fetch response and handle errors
const fetchWithErrorCheck = async (url: string, options?: RequestInit) => {
	const res = await fetch(url, options);
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`);
	}
	return data;
};

// GET /admin/inngest/status — Check Inngest connection status
inngestAdminRoutes.get("/status", async (c) => {
	try {
		const baseUrl = await getInngestBaseUrl();

		if (await isSelfHosted()) {
			const res = await fetch(`${baseUrl}/health`);
			const healthy = res.ok;

			return c.json({
				status: healthy ? "connected" : "error",
				mode: "self-hosted",
				url: baseUrl,
			});
		} else {
			const headers = await getInngestHeaders();
			const res = await fetch(`${baseUrl}/v1/functions`, { headers });
			const connected = res.ok;

			return c.json({
				status: connected ? "connected" : "error",
				mode: "cloud",
				url: baseUrl,
			});
		}
	} catch (err: any) {
		return c.json({
			status: "error",
			error: err.message,
		});
	}
});

// GET /admin/inngest/functions — List all registered functions
inngestAdminRoutes.get("/functions", async (c) => {
	try {
		const baseUrl = await getInngestBaseUrl();
		const headers = await getInngestHeaders();
		const envId = await getInngestEnv();

		if (await isSelfHosted()) {
			// Self-hosted Inngest has different API structure
			// Return local functions from inngest.ts
			const { allInngestFunctions } = await import("../../lib/inngest");

			const functions = allInngestFunctions.map((fn) => {
				const fnAny = fn as unknown as { id: string };
				return {
					id: fnAny.id,
					name: fnAny.id,
					status: "active",
					createdAt: new Date().toISOString(),
					triggers: [{ type: "event", event: `betterbase/${fnAny.id.split("-").pop()}` }],
				};
			});

			return c.json({ functions });
		}

		const url = envId ? `${baseUrl}/v1/environments/${envId}/functions` : `${baseUrl}/v1/functions`;

		const data = await fetchWithErrorCheck(url, { headers });

		return c.json({ functions: data.functions ?? [] });
	} catch (err: any) {
		return c.json({ error: err.message }, 500);
	}
});

// GET /admin/inngest/functions/:id/runs — List recent runs for a function
inngestAdminRoutes.get("/functions/:id/runs", async (c) => {
	try {
		const functionId = c.req.param("id");
		const baseUrl = await getInngestBaseUrl();
		const headers = await getInngestHeaders();
		const envId = await getInngestEnv();

		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "20"), 100);
		const status = c.req.query("status");

		const params = new URLSearchParams({ limit: String(limit) });
		if (status) params.append("status", status);

		if (await isSelfHosted()) {
			// Self-hosted: query from database webhook_deliveries by webhook_id
			// Note: functionId in routes refers to webhook ID for webhook deliveries
			const pool = getPool();
			const { rows } = await pool.query(
				`SELECT id, webhook_id, status, created_at as started_at, 
                delivered_at as ended_at, response_code, duration_ms, response_body
         FROM betterbase_meta.webhook_deliveries
         WHERE webhook_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
				[functionId, limit],
			);

			const runs = rows.map((r: any) => ({
				id: r.id,
				functionId: r.webhook_id,
				status: r.status === "success" ? "complete" : r.status === "pending" ? "pending" : "failed",
				startedAt: r.started_at,
				endedAt: r.ended_at,
				output: r.response_code ? `HTTP ${r.response_code} (${r.duration_ms}ms)` : null,
				error: r.status === "failed" ? r.response_body : undefined,
			}));

			return c.json({ runs });
		}

		const url = envId
			? `${baseUrl}/v1/environments/${envId}/functions/${functionId}/runs?${params}`
			: `${baseUrl}/v1/functions/${functionId}/runs?${params}`;

		const data = await fetchWithErrorCheck(url, { headers });

		return c.json({ runs: data.runs ?? [] });
	} catch (err: any) {
		return c.json({ error: err.message }, 500);
	}
});

// GET /admin/inngest/runs/:runId — Get detailed run information
inngestAdminRoutes.get("/runs/:runId", async (c) => {
	try {
		const runId = c.req.param("runId");
		const baseUrl = await getInngestBaseUrl();
		const headers = await getInngestHeaders();
		const envId = await getInngestEnv();

		if (await isSelfHosted()) {
			// Self-hosted: get from database
			const pool = getPool();
			const { rows } = await pool.query(
				`SELECT * FROM betterbase_meta.webhook_deliveries WHERE id = $1`,
				[runId],
			);

			if (rows.length === 0) {
				return c.json({ error: "Run not found" }, 404);
			}

			const r = rows[0];
			return c.json({
				id: r.id,
				functionId: r.webhook_id,
				status: r.status === "success" ? "complete" : r.status,
				startedAt: r.created_at,
				endedAt: r.delivered_at,
				output: r.response_body,
				error: r.status === "failed" ? r.response_body : undefined,
				history: [{ name: "send-http-request", status: r.status, output: r.response_body }],
			});
		}

		const url = envId
			? `${baseUrl}/v1/environments/${envId}/runs/${runId}`
			: `${baseUrl}/v1/runs/${runId}`;

		const data = await fetchWithErrorCheck(url, { headers });

		return c.json(data);
	} catch (err: any) {
		return c.json({ error: err.message }, 500);
	}
});

// POST /admin/inngest/functions/:id/test — Trigger test event with function-specific payload
inngestAdminRoutes.post("/functions/:id/test", async (c) => {
	try {
		const functionId = c.req.param("id");

		// Map function IDs to event names and test payloads
		const functionConfig: Record<string, { eventName: string; payload: any }> = {
			"deliver-webhook": {
				eventName: "betterbase/webhook.deliver",
				payload: {
					webhookId: "test-webhook-id",
					webhookName: "Test Webhook",
					url: "https://example.com/webhook",
					secret: null,
						eventType: "TEST",
						tableName: "users",
						payload: { id: "test-123", example: "data", _test: true },
					},
				},
			"evaluate-notification-rule": {
				eventName: "betterbase/notification.evaluate",
				payload: {
					ruleId: "test-rule-id",
					ruleName: "Test Alert Rule",
					metric: "error_rate",
					threshold: 5,
					channel: "email",
					target: "admin@example.com",
					currentValue: 10, // Above threshold for testing
				},
			},
			"export-project-users": {
				eventName: "betterbase/export.users",
				payload: {
					projectId: "test-project-id",
					projectSlug: "test-project",
					requestedBy: "admin@example.com",
					filters: { search: "test" },
				},
			},
			"poll-notification-rules": {
				// Cron-triggered function - can't be manually triggered
				eventName: "betterbase/notification.evaluate",
				payload: {
					ruleId: "cron-test",
					ruleName: "Cron Test",
					metric: "error_rate",
					threshold: 0,
					channel: "email",
					target: "admin@example.com",
					currentValue: 100,
				},
			},
		};

		// Find matching function config
		let config = functionConfig[functionId];
		if (!config) {
			// Try to find by partial match
			const entry = Object.entries(functionConfig).find(([k]) => functionId.includes(k));
			if (entry) {
				config = entry[1];
			}
		}

		if (!config) {
			return c.json({ error: "Unknown function type - cannot test cron-triggered functions" }, 400);
		}

		const { inngest } = await import("../../lib/inngest");
		await inngest.send({
			name: config.eventName as
				| "betterbase/webhook.deliver"
				| "betterbase/notification.evaluate"
				| "betterbase/export.users",
			data: config.payload,
		});

		return c.json({
			success: true,
			message: `Test event "${config.eventName}" sent. Check Inngest dashboard for run details.`,
		});
	} catch (err: any) {
		return c.json({ error: err.message }, 500);
	}
});

// POST /admin/inngest/runs/:runId/cancel — Cancel a running function
inngestAdminRoutes.post("/runs/:runId/cancel", async (c) => {
	try {
		const runId = c.req.param("runId");
		const baseUrl = await getInngestBaseUrl();
		const headers = await getInngestHeaders();
		const envId = await getInngestEnv();

		if (await isSelfHosted()) {
			// Self-hosted: cannot cancel (webhooks are synchronous from DB perspective)
			return c.json(
				{
					success: false,
					error: "Cannot cancel runs in self-hosted mode. Runs are synchronous.",
				},
				400,
			);
		}

		const url = envId
			? `${baseUrl}/v1/environments/${envId}/runs/${runId}/cancel`
			: `${baseUrl}/v1/runs/${runId}/cancel`;

		const data = await fetchWithErrorCheck(url, { method: "POST", headers });

		return c.json({ success: true, message: "Run cancelled successfully" });
	} catch (err: any) {
		return c.json({ error: err.message }, 500);
	}
});

// GET /admin/inngest/jobs — List export jobs (from DB)
inngestAdminRoutes.get("/jobs", async (c) => {
	try {
		const pool = getPool();
		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "20"), 100);

		const { rows } = await pool.query(
			`SELECT * FROM betterbase_meta.export_jobs
       ORDER BY created_at DESC
       LIMIT $1`,
			[limit],
		);

		return c.json({ jobs: rows });
	} catch (err: any) {
		return c.json({ error: err.message }, 500);
	}
});
