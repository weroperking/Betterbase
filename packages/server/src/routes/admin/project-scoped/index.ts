import { Hono } from "hono";
import { getPool } from "../../../lib/db";
import { projectAuthConfigRoutes } from "./auth-config";
import { projectDatabaseRoutes } from "./database";
import { projectEnvRoutes } from "./env";
import { projectFunctionRoutes } from "./functions";
import { projectIaCRoutes } from "./iac";
import { iacSyncRoutes } from "./iac-sync";
import { projectRealtimeRoutes } from "./realtime";
import { projectUserRoutes } from "./users";
import { projectWebhookRoutes } from "./webhooks";

export const projectScopedRouter = new Hono();

// Middleware: verify project exists and attach to context
projectScopedRouter.use("/:projectId/*", async (c, next) => {
	const pool = getPool();
	const { rows } = await pool.query(
		"SELECT id, name, slug FROM betterbase_meta.projects WHERE id = $1",
		[c.req.param("projectId")],
	);
	if (rows.length === 0) return c.json({ error: "Project not found" }, 404);
	c.set("project", rows[0]);
	await next();
});

projectScopedRouter.route("/:projectId/users", projectUserRoutes);
projectScopedRouter.route("/:projectId/auth-config", projectAuthConfigRoutes);
projectScopedRouter.route("/:projectId/database", projectDatabaseRoutes);
projectScopedRouter.route("/:projectId/realtime", projectRealtimeRoutes);
projectScopedRouter.route("/:projectId/env", projectEnvRoutes);
projectScopedRouter.route("/:projectId/webhooks", projectWebhookRoutes);
projectScopedRouter.route("/:projectId/functions", projectFunctionRoutes);
projectScopedRouter.route("/:projectId/iac", projectIaCRoutes);
projectScopedRouter.route("/:projectId/iac-sync", iacSyncRoutes);
