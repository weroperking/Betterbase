import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { requireAdmin } from "../../../lib/admin-middleware";
import { getPool } from "../../../lib/db";

export const iacSyncRoutes = new Hono();

function schemaName(project: { slug: string }) {
	return `project_${project.slug}`;
}

// POST /admin/projects/:projectId/iac-sync/schema
// Provision project schema tables and apply schema changes.
iacSyncRoutes.post(
	"/:projectId/schema",
	requireAdmin,
	zValidator(
		"json",
		z.object({
			schema: z
				.array(
					z.object({
						table: z.string().min(1).max(63),
						columns: z
							.array(
								z.object({
									name: z.string().min(1).max(63),
									type: z.string().min(1).max(63),
									nullable: z.boolean().default(true),
								}),
							)
							.min(1),
					}),
				)
				.optional(),
			force: z.boolean().default(false),
		}),
	),
	async (c) => {
		const project = c.get("project") as { id: string; slug: string } | undefined;
		if (!project) return c.json({ error: "Project not found" }, 404);

		const { schema, force } = c.req.valid("json");
		const pool = getPool();
		const s = schemaName(project);

		// Ensure the project schema exists.
		await provisionProjectSchema(pool, project.slug);

		const applied: string[] = [];

		// Apply schema changes by creating any tables that do not yet exist.
		for (const def of schema ?? []) {
			const exists = await pool.query(
				"SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2",
				[s, def.table],
			);
			if (exists.rows.length > 0) {
				if (!force) {
					applied.push(`${def.table} (skipped: exists)`);
					continue;
				}
			}

			const cols = def.columns
				.map((col) => `${col.name} ${col.type}${col.nullable ? "" : " NOT NULL"}`)
				.join(", ");

			await pool.query(`CREATE TABLE IF NOT EXISTS ${s}.${def.table} (${cols})`);
			applied.push(`${def.table} (${def.columns.length} columns)`);
		}

		return c.json({ success: true, schemaName: s, applied });
	},
);

// POST /admin/projects/:projectId/iac-sync/environment
// Store environment configuration for the project.
iacSyncRoutes.post(
	"/:projectId/environment",
	requireAdmin,
	zValidator(
		"json",
		z.object({
			envConfig: z
				.array(
					z.object({
						key: z
							.string()
							.regex(/^[A-Z][A-Z0-9_]*$/, "Key must be uppercase alphanumeric with underscores"),
						value: z.string(),
						is_secret: z.boolean().default(true),
					}),
				)
				.min(1),
		}),
	),
	async (c) => {
		const project = c.get("project") as { id: string; slug: string } | undefined;
		if (!project) return c.json({ error: "Project not found" }, 404);

		const { envConfig } = c.req.valid("json");
		const pool = getPool();
		const s = schemaName(project);

		const stored: string[] = [];
		for (const entry of envConfig) {
			await pool.query(
				`INSERT INTO ${s}.env_vars (key, value, is_secret, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value=$2, is_secret=$3, updated_at=NOW()`,
				[entry.key, entry.value, entry.is_secret],
			);
			stored.push(entry.key);
		}

		return c.json({ success: true, stored });
	},
);

// POST /admin/projects/:projectId/iac-sync
// Register/create project scope marker for IaC sync. Returns the resolved id/slug.
iacSyncRoutes.post("/:projectId", requireAdmin, async (c) => {
	const project = c.get("project") as { id: string; slug: string } | undefined;
	if (!project) return c.json({ error: "Project not found" }, 404);

	return c.json({ id: project.id, slug: project.slug });
});

async function provisionProjectSchema(pool: ReturnType<typeof getPool>, slug: string) {
	await pool.query("SELECT betterbase_meta.provision_project_schema($1)", [slug]);
}
