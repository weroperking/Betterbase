import { mountAutoRest } from "@betterbase/core";
import { discoverFunctions, setFunctionRegistry } from "@betterbase/core/iac";
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
import { getBunServeConfig } from "./routes/betterbase/ws";
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

// Discover and register betterbase/ IaC functions so /betterbase/* routes resolve
try {
	const { join } = await import("node:path");
	const fns = await discoverFunctions(join(process.cwd(), "betterbase"));
	setFunctionRegistry(fns);
	console.log(`[server] Registered ${fns.length} betterbase function(s)`);
} catch (err) {
	console.error("[server] Failed to discover betterbase functions:", err);
}

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

// ─── Auto-REST CRUD mounting ────────────────────────────────────────────────
// mountAutoRest(app, db, schema) generates /api/:table CRUD routes from a
// Drizzle schema. This control-plane server is schema-agnostic: per-project
// schemas (project_<slug>) are provisioned at runtime, and drizzle-orm is not
// a dependency here. We therefore mount it only if a Drizzle db + schema
// source is resolvable, and otherwise skip safely without crashing boot.
try {
	// A control-plane-level Drizzle schema may be provided via a local module
	// exporting `db` and `schema` (e.g. ./lib/auto-rest-schema). If absent,
	// the control-plane is schema-agnostic and we skip safely.
	const autoRestSchemaPath = "./lib/auto-rest-schema";
	const autoRestSource = (await import(autoRestSchemaPath).catch(() => null)) as {
		db?: unknown;
		schema?: Record<string, unknown>;
	} | null;

	if (autoRestSource?.db && autoRestSource.schema) {
		mountAutoRest(app, autoRestSource.db, autoRestSource.schema, {
			enabled: true,
			basePath: "/api",
			enableRLS: true,
		});
		console.log("[server] Auto-REST CRUD routes mounted");
	} else {
		console.log(
			"[server] Auto-REST skipped: no Drizzle schema source available in control-plane server",
		);
	}
} catch (err) {
	console.error("[server] Auto-REST mount failed (skipped):", err);
}

// 404
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
	console.error("[error]", err);
	return c.json({ error: "Internal server error" }, 500);
});

const port = Number.parseInt((env as { PORT?: string }).PORT ?? "3000");

// ─── Realtime WebSocket serve config ────────────────────────────────────────
// getBunServeConfig() returns the Bun.serve options (fetch upgrade path +
// websocket handler) for the realtime WS. Its fetch is async and resolves to a
// Response for WS upgrade requests, or `undefined` for non-WS paths — in which
// case we fall back to the Hono app for everything else.
const wsConfig = getBunServeConfig();

const server = Bun.serve({
	port,
	async fetch(req: Request, server: unknown) {
		const wsResponse = await wsConfig.fetch(req, server);
		if (wsResponse !== undefined) return wsResponse;
		return app.fetch(req, server as Parameters<typeof app.fetch>[1]);
	},
	websocket: wsConfig.websocket,
});

console.log(`[server] Betterbase server running on port ${server.port}`);

export default server;
