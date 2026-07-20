import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { requireAdmin } from "../../../lib/admin-middleware";
import { getClientIp, writeAuditLog } from "../../../lib/audit";
import { getPool } from "../../../lib/db";

export const iacSyncRoutes = new Hono();

function schemaName(project: { slug: string }) {
	return `project_${project.slug}`;
}

// Allowlist for SQL identifiers interpolated into CREATE TABLE statements.
// Rejects quoting, separators, whitespace, and any SQL syntax so untrusted
// table/column/type names cannot break out of the identifier position.
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

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
						table: z
							.string()
							.min(1)
							.max(63)
							.regex(SAFE_IDENTIFIER, "Table name contains unsafe characters"),
						columns: z
							.array(
								z.object({
									name: z
										.string()
										.min(1)
										.max(63)
										.regex(SAFE_IDENTIFIER, "Column name contains unsafe characters"),
									type: z
										.string()
										.min(1)
										.max(63)
										.regex(SAFE_IDENTIFIER, "Column type contains unsafe characters"),
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

				// force=true on an existing table: reconcile missing columns
				// instead of reporting a no-op CREATE. Determine which declared
				// columns are absent and add them.
				const { rows: existingCols } = await pool.query(
					"SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2",
					[s, def.table],
				);
				const present = new Set(existingCols.map((r: { column_name: string }) => r.column_name));
				const missing = def.columns.filter((col) => !present.has(col.name));

				for (const col of missing) {
					await pool.query(
						`ALTER TABLE ${s}.${def.table} ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}${
							col.nullable ? "" : " NOT NULL"
						}`,
					);
				}
				applied.push(
					missing.length > 0
						? `${def.table} (reconciled: ${missing.length} new column(s))`
						: `${def.table} (skipped: exists)`,
				);
				continue;
			}

			const cols = def.columns
				.map((col) => `${col.name} ${col.type}${col.nullable ? "" : " NOT NULL"}`)
				.join(", ");

			await pool.query(`CREATE TABLE IF NOT EXISTS ${s}.${def.table} (${cols})`);
			applied.push(`${def.table} (${def.columns.length} columns)`);
		}

		const admin = c.get("adminUser") as { id: string; email: string } | undefined;
		if (admin) {
			writeAuditLog({
				actorId: admin.id,
				actorEmail: admin.email,
				action: "iac.schema.sync",
				resourceType: "project",
				resourceId: project.id,
				resourceName: project.slug,
				afterData: { schemaName: s, applied },
				ipAddress: getClientIp(c.req.raw.headers),
				userAgent: c.req.header("User-Agent") ?? undefined,
			});
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

		const admin = c.get("adminUser") as { id: string; email: string } | undefined;
		if (admin) {
			writeAuditLog({
				actorId: admin.id,
				actorEmail: admin.email,
				action: "iac.env.sync",
				resourceType: "project",
				resourceId: project.id,
				resourceName: project.slug,
				afterData: { stored },
				ipAddress: getClientIp(c.req.raw.headers),
				userAgent: c.req.header("User-Agent") ?? undefined,
			});
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
