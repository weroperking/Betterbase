import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { getClientIp, writeAuditLog } from "../../lib/audit";
import { getPool } from "../../lib/db";

export const instanceRoutes = new Hono();

// GET /admin/instance  — all settings as key-value object
instanceRoutes.get("/", async (c) => {
	const pool = getPool();
	const { rows } = await pool.query(
		"SELECT key, value, updated_at FROM betterbase_meta.instance_settings ORDER BY key",
	);
	// Convert rows to a flat object { key: parsedValue }
	const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
	return c.json({ settings });
});

// PATCH /admin/instance  — update one or more settings
instanceRoutes.patch(
	"/",
	zValidator(
		"json",
		z.object({
			instance_name: z.string().min(1).max(100).optional(),
			public_url: z.string().url().optional(),
			contact_email: z.string().email().optional(),
			log_retention_days: z.number().int().min(1).max(3650).optional(),
			max_sessions_per_user: z.number().int().min(1).max(1000).optional(),
			require_email_verification: z.boolean().optional(),
			ip_allowlist: z.array(z.string()).optional(),
			cors_origins: z.array(z.string().url()).optional(),
			inngest_api_key: z.string().optional(),
			inngest_env_id: z.string().optional(),
			inngest_base_url: z.string().url().optional().or(z.literal("")),
		}),
	),
	async (c) => {
		const data = c.req.valid("json");
		const pool = getPool();
		const admin = c.get("adminUser") as { id: string; email: string };

		const updates = Object.entries(data).filter(([, v]) => v !== undefined);
		for (const [key, value] of updates) {
			await pool.query(
				`INSERT INTO betterbase_meta.instance_settings (key, value, updated_at, updated_by)
         VALUES ($1, $2::jsonb, NOW(), $3)
         ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW(), updated_by = $3`,
				[key, JSON.stringify(value), admin.id],
			);
		}

		await writeAuditLog({
			actorId: admin.id,
			actorEmail: admin.email,
			action: "settings.update",
			afterData: data,
			ipAddress: getClientIp(c.req.raw.headers),
		});

		return c.json({ success: true });
	},
);

// GET /admin/instance/health  — connection health checks
instanceRoutes.get("/health", async (c) => {
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

	return c.json({
		health: {
			database: { status: dbStatus, latency_ms: dbLatencyMs },
			server: { status: "ok", uptime_seconds: Math.floor(process.uptime()) },
		},
	});
});
