import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { getClientIp, writeAuditLog } from "../../../lib/audit";
import { escapeCSVValue } from "../../../lib/csv";
import { getPool } from "../../../lib/db";

export const projectUserRoutes = new Hono();

function schemaName(project: { slug: string }) {
	return `project_${project.slug}`;
}

// GET /admin/projects/:id/users?limit=50&offset=0&search=&provider=&banned=&from=&to=
projectUserRoutes.get("/", async (c) => {
	const pool = getPool();
	const project = c.get("project") as { id: string; slug: string };
	const s = schemaName(project);

	const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50"), 200);
	const offset = Number.parseInt(c.req.query("offset") ?? "0");
	const search = c.req.query("search");
	const provider = c.req.query("provider");
	const banned = c.req.query("banned");
	const from = c.req.query("from");
	const to = c.req.query("to");

	const conditions: string[] = [];
	const params: unknown[] = [];
	let idx = 1;

	if (search) {
		conditions.push(`(u.email ILIKE $${idx} OR u.name ILIKE $${idx})`);
		params.push(`%${search}%`);
		idx++;
	}
	if (banned !== undefined) {
		conditions.push(`u.banned = $${idx}`);
		params.push(banned === "true");
		idx++;
	}
	if (from) {
		conditions.push(`u.created_at >= $${idx}`);
		params.push(from);
		idx++;
	}
	if (to) {
		conditions.push(`u.created_at <= $${idx}`);
		params.push(to);
		idx++;
	}

	const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

	const { rows: users } = await pool.query(
		`SELECT u.id, u.name, u.email, u.email_verified, u.image, u.created_at, u.banned, u.ban_reason, u.ban_expires,
            array_agg(DISTINCT a.provider_id) FILTER (WHERE a.provider_id IS NOT NULL) AS providers,
            MAX(ses.created_at) AS last_sign_in
     FROM ${s}."user" u
     LEFT JOIN ${s}.account a ON a.user_id = u.id
     LEFT JOIN ${s}.session ses ON ses.user_id = u.id
     ${where}
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
		[...params, limit, offset],
	);

	const { rows: countRows } = await pool.query(
		`SELECT COUNT(*)::int AS total FROM ${s}."user" u ${where}`,
		params,
	);

	return c.json({ users, total: countRows[0].total, limit, offset });
});

// GET /admin/projects/:id/users/:userId
projectUserRoutes.get("/:userId", async (c) => {
	const pool = getPool();
	const project = c.get("project") as { id: string; slug: string };
	const s = schemaName(project);

	const { rows: users } = await pool.query(
		`SELECT u.*, array_agg(DISTINCT a.provider_id) FILTER (WHERE a.provider_id IS NOT NULL) AS providers
     FROM ${s}."user" u
     LEFT JOIN ${s}.account a ON a.user_id = u.id
     WHERE u.id = $1
     GROUP BY u.id`,
		[c.req.param("userId")],
	);
	if (users.length === 0) return c.json({ error: "User not found" }, 404);

	const { rows: sessions } = await pool.query(
		`SELECT id, expires_at, ip_address, user_agent, created_at
     FROM ${s}.session WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
		[c.req.param("userId")],
	);

	return c.json({ user: users[0], sessions });
});

// PATCH /admin/projects/:id/users/:userId/ban
projectUserRoutes.patch(
	"/:userId/ban",
	zValidator(
		"json",
		z.object({
			banned: z.boolean(),
			ban_reason: z.string().optional(),
			ban_expires: z.string().datetime().optional(),
		}),
	),
	async (c) => {
		const data = c.req.valid("json");
		const pool = getPool();
		const project = c.get("project") as { id: string; slug: string; name: string };
		const admin = c.get("adminUser") as { id: string; email: string };
		const s = schemaName(project);

		const { rows: before } = await pool.query(`SELECT * FROM ${s}."user" WHERE id = $1`, [
			c.req.param("userId"),
		]);
		if (before.length === 0) return c.json({ error: "User not found" }, 404);

		const { rows } = await pool.query(
			`UPDATE ${s}."user"
       SET banned = $1, ban_reason = $2, ban_expires = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, email, banned, ban_reason, ban_expires`,
			[data.banned, data.ban_reason ?? null, data.ban_expires ?? null, c.req.param("userId")],
		);

		await writeAuditLog({
			actorId: admin.id,
			actorEmail: admin.email,
			action: data.banned ? "project.user.ban" : "project.user.unban",
			resourceType: "user",
			resourceId: c.req.param("userId"),
			resourceName: before[0].email,
			beforeData: { banned: before[0].banned },
			afterData: { banned: data.banned, reason: data.ban_reason },
			ipAddress: getClientIp(c.req.raw.headers),
		});

		// Revoke all sessions if banned
		if (data.banned) {
			await pool.query(`DELETE FROM ${s}.session WHERE user_id = $1`, [c.req.param("userId")]);
		}

		return c.json({ user: rows[0] });
	},
);

// DELETE /admin/projects/:id/users/:userId
projectUserRoutes.delete("/:userId", async (c) => {
	const pool = getPool();
	const project = c.get("project") as { id: string; slug: string };
	const admin = c.get("adminUser") as { id: string; email: string };
	const s = schemaName(project);

	const { rows } = await pool.query(`DELETE FROM ${s}."user" WHERE id = $1 RETURNING id, email`, [
		c.req.param("userId"),
	]);
	if (rows.length === 0) return c.json({ error: "User not found" }, 404);

	await writeAuditLog({
		actorId: admin.id,
		actorEmail: admin.email,
		action: "project.user.delete",
		resourceType: "user",
		resourceId: c.req.param("userId"),
		resourceName: rows[0].email,
		ipAddress: getClientIp(c.req.raw.headers),
	});

	return c.json({ success: true });
});

// DELETE /admin/projects/:id/users/:userId/sessions  — force logout
projectUserRoutes.delete("/:userId/sessions", async (c) => {
	const pool = getPool();
	const project = c.get("project") as { id: string; slug: string };
	const s = schemaName(project);

	const { rowCount } = await pool.query(`DELETE FROM ${s}.session WHERE user_id = $1`, [
		c.req.param("userId"),
	]);

	return c.json({ success: true, sessions_revoked: rowCount });
});

// GET /admin/projects/:id/users/stats/overview  — growth + activity charts
projectUserRoutes.get("/stats/overview", async (c) => {
	const pool = getPool();
	const project = c.get("project") as { id: string; slug: string };
	const s = schemaName(project);

	const [total, banned, daily, providers] = await Promise.all([
		pool.query(`SELECT COUNT(*)::int AS count FROM ${s}."user"`),
		pool.query(`SELECT COUNT(*)::int AS count FROM ${s}."user" WHERE banned = TRUE`),
		pool.query(`
      SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS signups
      FROM ${s}."user"
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY 1 ORDER BY 1
    `),
		pool.query(`
      SELECT provider_id, COUNT(*)::int AS count
      FROM ${s}.account
      GROUP BY provider_id ORDER BY count DESC
    `),
	]);

	return c.json({
		total: total.rows[0].count,
		banned: banned.rows[0].count,
		daily_signups_30d: daily.rows,
		provider_breakdown: providers.rows,
	});
});

// POST /admin/projects/:id/users/export  — CSV export
projectUserRoutes.post("/export", async (c) => {
	const pool = getPool();
	const project = c.get("project") as { id: string; slug: string };
	const admin = c.get("adminUser") as { id: string; email: string };
	const s = schemaName(project);

	const { rows } = await pool.query(
		`SELECT id, name, email, email_verified, created_at, banned FROM ${s}."user" ORDER BY created_at DESC`,
	);

	const header = "id,name,email,email_verified,created_at,banned\n";
	const csv =
		header +
		rows
			.map(
				(r) =>
					[
						escapeCSVValue(r.id),
						escapeCSVValue(r.name),
						escapeCSVValue(r.email),
						escapeCSVValue(r.email_verified),
						escapeCSVValue(r.created_at),
						escapeCSVValue(r.banned),
					].join(","),
			)
			.join("\n");

	writeAuditLog({
		actorId: admin.id,
		actorEmail: admin.email,
		action: "project.user.export",
		resourceType: "project",
		resourceId: project.id,
		resourceName: project.slug,
		afterData: {
			exported_count: rows.length,
			fields: ["id", "name", "email", "email_verified", "created_at", "banned"],
		},
		ipAddress: getClientIp(c.req.raw.headers),
		userAgent: c.req.header("User-Agent") ?? undefined,
	});

	return new Response(csv, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="users-${project.slug}-${Date.now()}.csv"`,
			"Content-Security-Policy": "default-src 'none'",
		},
	});
});
