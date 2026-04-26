import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { getClientIp, writeAuditLog } from "../../lib/audit";
import {
	extractBearerToken,
	signAdminToken,
	verifyAdminToken,
	verifyPassword,
} from "../../lib/auth";
import { getPool } from "../../lib/db";

export const authRoutes = new Hono();

// POST /admin/auth/login
authRoutes.post(
	"/login",
	zValidator(
		"json",
		z.object({
			email: z.string().email(),
			password: z.string().min(1),
		}),
	),
	async (c) => {
		const { email, password } = c.req.valid("json");
		const pool = getPool();

		const { rows } = await pool.query(
			"SELECT id, email, password_hash FROM betterbase_meta.admin_users WHERE email = $1",
			[email],
		);
		if (rows.length === 0) {
			return c.json({ error: "Invalid credentials" }, 401);
		}

		const admin = rows[0];
		const valid = await verifyPassword(password, admin.password_hash);
		if (!valid) {
			return c.json({ error: "Invalid credentials" }, 401);
		}

		const token = await signAdminToken(admin.id);
		return c.json({ token, admin: { id: admin.id, email: admin.email } });
	},
);

// GET /admin/auth/me  (requires token)
authRoutes.get("/me", async (c) => {
	const token = extractBearerToken(c.req.header("Authorization"));
	if (!token) return c.json({ error: "Unauthorized" }, 401);

	const payload = await verifyAdminToken(token);
	if (!payload) return c.json({ error: "Unauthorized" }, 401);

	const pool = getPool();
	const { rows } = await pool.query(
		"SELECT id, email, created_at FROM betterbase_meta.admin_users WHERE id = $1",
		[payload.sub],
	);
	if (rows.length === 0) return c.json({ error: "Unauthorized" }, 401);

	return c.json({ admin: rows[0] });
});

// POST /admin/auth/logout
authRoutes.post("/logout", async (c) => {
	const token = extractBearerToken(c.req.header("Authorization"));
	if (!token) return c.json({ success: true });

	const payload = await verifyAdminToken(token);
	if (!payload) return c.json({ success: true });

	const pool = getPool();
	if (payload.jti) {
		await pool.query(
			`INSERT INTO betterbase_meta.revoked_admin_tokens (jti, admin_user_id, expires_at)
			 VALUES ($1, $2, to_timestamp($3))
			 ON CONFLICT (jti) DO NOTHING`,
			[payload.jti, payload.sub, payload.exp ?? Math.floor(Date.now() / 1000)],
		);
	}

	const { rows } = await pool.query("SELECT id, email FROM betterbase_meta.admin_users WHERE id = $1", [
		payload.sub,
	]);
	if (rows.length > 0) {
		await writeAuditLog({
			actorId: rows[0].id,
			actorEmail: rows[0].email,
			action: "admin.logout",
			ipAddress: getClientIp(c.req.raw.headers),
			userAgent: c.req.header("User-Agent") ?? undefined,
		});
	}

	return c.json({ success: true });
});

// GET /admin/auth/setup-status — check if admin exists (no body validation)
authRoutes.get("/setup-status", async (c) => {
	const pool = getPool();
	const { rows } = await pool.query(
		"SELECT COUNT(*)::int as count FROM betterbase_meta.admin_users",
	);
	if (rows[0].count === 0) {
		return c.json({ setup: false }, 404);
	}
	return c.json({ setup: true });
});

// POST /admin/auth/setup  — available only before first admin is created
authRoutes.post(
	"/setup",
	zValidator(
		"json",
		z.object({
			email: z.string().email(),
			password: z.string().min(8),
		}),
	),
	async (c) => {
		const pool = getPool();

		// Check if any admin exists
		const { rows } = await pool.query(
			"SELECT COUNT(*)::int as count FROM betterbase_meta.admin_users",
		);
		if (rows[0].count > 0) {
			return c.json({ error: "Setup already complete" }, 410);
		}

		const { email, password } = c.req.valid("json");
		const { hashPassword, signAdminToken: signToken } = await import("../../lib/auth");
		const { nanoid } = await import("nanoid");

		const passwordHash = await hashPassword(password);
		const { rows: newAdmin } = await pool.query(
			"INSERT INTO betterbase_meta.admin_users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email",
			[nanoid(), email, passwordHash],
		);

		const token = await signToken(newAdmin[0].id);
		return c.json(
			{
				message: "Admin account created. Save your token — log in with `bb login`.",
				admin: newAdmin[0],
				token,
			},
			201,
		);
	},
);
