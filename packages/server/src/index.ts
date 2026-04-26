import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "inngest/hono";
import { getClientIp } from "./lib/audit";
import { getPool } from "./lib/db";
import { validateEnv } from "./lib/env";
import { allInngestFunctions, inngest } from "./lib/inngest";
import { runMigrations } from "./lib/migrate";
import { adminRouter } from "./routes/admin/index";
import { betterbaseRouter } from "./routes/betterbase/index";
import { deviceRouter } from "./routes/device/index";

// Validate env first — exits if invalid
const env = validateEnv();

// Bootstrap
const pool = getPool();
await runMigrations(pool);
// Cleanup revoked tokens on interval (fire-and-forget)
setInterval(
	() =>
		getPool()
			.query("DELETE FROM betterbase_meta.revoked_admin_tokens WHERE expires_at < NOW()")
			.catch((err) => console.error("[auth] Failed revoked token cleanup:", err)),
	60 * 60 * 1000,
);

// Seed initial admin if env vars provided and no admin exists
if (env.BETTERBASE_ADMIN_EMAIL && env.BETTERBASE_ADMIN_PASSWORD) {
	const { seedAdminUser } = await import("./lib/auth");
	await seedAdminUser(pool, env.BETTERBASE_ADMIN_EMAIL, env.BETTERBASE_ADMIN_PASSWORD);
}

// App
const app = new Hono();

app.use("*", logger());

// Request logging middleware - fire and forget
app.use("*", async (c, next) => {
	const start = Date.now();
	await next();
	const duration = Date.now() - start;

	const projectId = c.req.header("X-Project-ID") ?? null;
	const userAgent = c.req.header("User-Agent")?.slice(0, 255) ?? null;
	const ip = getClientIp(c.req.raw.headers);

	// Fire-and-forget log insert (don't await, don't fail requests on log error)
	getPool()
		.query(
			`INSERT INTO betterbase_meta.request_logs
			(method, path, status, duration_ms, project_id, user_agent, ip)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			[c.req.method, new URL(c.req.url).pathname, c.res.status, duration, projectId, userAgent, ip],
		)
		.catch(() => {}); // Silently ignore log failures
});

app.use(
	"*",
	cors({
		origin: env.CORS_ORIGINS.split(","),
		credentials: true,
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	}),
);

// Health check — used by Docker HEALTHCHECK
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// ─── Inngest Function Serve Handler ──────────────────────────────────────────
// This endpoint is called by the Inngest backend (cloud or self-hosted) to
// execute registered functions. It handles GET (introspection/registration)
// and POST (function execution) automatically.
app.on(
	["GET", "POST", "PUT"],
	"/api/inngest",
	serve({
		client: inngest,
		functions: allInngestFunctions,
		signingKey: env.INNGEST_SIGNING_KEY,
	}),
);

// Routers
app.route("/admin", adminRouter);
app.route("/device", deviceRouter);
app.route("/betterbase", betterbaseRouter);

// 404
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
	console.error("[error]", err);
	return c.json({ error: "Internal server error" }, 500);
});

const port = Number.parseInt((env as { PORT?: string }).PORT ?? "3000");
console.log(`[server] Betterbase server running on port ${port}`);

export default {
	port,
	fetch: app.fetch,
};
