import { zValidator } from "@hono/zod-validator";
import { createHash } from "crypto";
import { Hono, type Context } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { signAdminToken, verifyPassword } from "../../lib/auth";
import { getPool } from "../../lib/db";
import { validateEnv } from "../../lib/env";

export const deviceRouter = new Hono();

const CODE_EXPIRY_MINUTES = 10;
const DEVICE_CODE_RATE_LIMIT_WINDOW_MS = 60_000;
const DEVICE_CODE_RATE_LIMIT_MAX = 5;
const FALLBACK_PASSWORD_HASH = "$2a$12$KIXQ4Q0A9fU8A6.vW2YCwOp0q1fYQxN6v6M3fPazTA/gkGEXUXMa2";

function resolveClientIp(c: Context): string {
	const trustProxy = process.env.TRUSTED_PROXY === "true";
	if (trustProxy) {
		const realIp = c.req.header("X-Real-IP")?.trim();
		if (realIp && /^[a-fA-F0-9:.]+$/.test(realIp)) return realIp;

		const xff = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();
		if (xff && /^[a-fA-F0-9:.]+$/.test(xff)) return xff;
	}

	const rawReq = c.req.raw as any;
	return rawReq?.socket?.remoteAddress ?? rawReq?.connection?.remoteAddress ?? "unknown";
}

function getRateLimitKey(c: Context): string {
	const ip = resolveClientIp(c);
	const ua = c.req.header("User-Agent") ?? "";
	const fingerprint = createHash("sha256").update(ua).digest("hex").slice(0, 16);
	return `ipfp:${ip}:${fingerprint}`;
}

async function checkRateLimit(key: string): Promise<boolean> {
	const pool = getPool();
	const result = await pool.query<{ count: number }>(
		`INSERT INTO betterbase_meta.rate_limits (key, count, expires_at)
		 VALUES ($1, 1, NOW() + ($2 * INTERVAL '1 millisecond'))
		 ON CONFLICT (key) DO UPDATE
		 SET count = CASE
		   WHEN betterbase_meta.rate_limits.expires_at <= NOW() THEN 1
		   ELSE betterbase_meta.rate_limits.count + 1
		 END,
		 expires_at = CASE
		   WHEN betterbase_meta.rate_limits.expires_at <= NOW() THEN NOW() + ($2 * INTERVAL '1 millisecond')
		   ELSE betterbase_meta.rate_limits.expires_at
		 END
		 RETURNING count`,
		[key, DEVICE_CODE_RATE_LIMIT_WINDOW_MS],
	);
	pool.query("DELETE FROM betterbase_meta.rate_limits WHERE expires_at <= NOW()").catch(() => {});
	return result.rows[0].count <= DEVICE_CODE_RATE_LIMIT_MAX;
}

// POST /device/code  — CLI calls this to initiate login
deviceRouter.post("/code", async (c) => {
	const key = getRateLimitKey(c);
	if (!(await checkRateLimit(`device:code:${key}`))) {
		return c.json({ error: "Rate limit exceeded. Try again in a minute." }, 429);
	}

	const pool = getPool();

	const deviceCode = nanoid(32);
	const userCode = nanoid(8).toUpperCase(); // Human-readable: shown in CLI
	const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

	await pool.query(
		`INSERT INTO betterbase_meta.device_codes (user_code, device_code, expires_at)
     VALUES ($1, $2, $3)`,
		[userCode, deviceCode, expiresAt],
	);

	const env = validateEnv();
	const baseUrl = env.BETTERBASE_PUBLIC_URL ?? `http://localhost:${env.PORT}`;

	return c.json({
		device_code: deviceCode,
		user_code: userCode,
		verification_uri: `${baseUrl}/device/verify`,
		expires_in: CODE_EXPIRY_MINUTES * 60,
		interval: 5, // CLI polls every 5 seconds
	});
});

// GET /device/verify  — Browser opens this page to approve
deviceRouter.get("/verify", async (c) => {
	const userCode = c.req.query("code");
	// Return minimal HTML form for verification
	const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Betterbase CLI Login</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 400px; margin: 100px auto; padding: 0 20px; }
  input, button { width: 100%; padding: 10px; margin: 8px 0; border-radius: 6px; border: 1px solid #ccc; font-size: 16px; }
  button { background: #2563eb; color: white; border: none; cursor: pointer; }
  button:hover { background: #1d4ed8; }
  .error { color: red; }
  .success { color: green; }
</style>
</head>
<body>
  <h2>Betterbase CLI Login</h2>
  <p>Enter your admin credentials to authorize the CLI.</p>
  <form method="POST" action="/device/verify">
    <input name="user_code" placeholder="User Code (e.g. ABC12345)" value="${userCode ?? ""}" required />
    <input name="email" type="email" placeholder="Admin Email" required />
    <input name="password" type="password" placeholder="Password" required />
    <button type="submit">Authorize CLI</button>
  </form>
</body>
</html>`;
	return c.html(html);
});

// POST /device/verify  — Form submission
deviceRouter.post("/verify", async (c) => {
	const key = getRateLimitKey(c);
	if (!(await checkRateLimit(`device:verify:${key}`))) {
		return c.html(`<p style="color:red">Invalid credentials.</p>`, 429);
	}

	const body = await c.req.parseBody();
	const userCode = String(body.user_code ?? "")
		.toUpperCase()
		.trim();
	const email = String(body.email ?? "").trim();
	const password = String(body.password ?? "");

	const pool = getPool();

	// Verify admin credentials
	const { rows: admins } = await pool.query(
		"SELECT id, password_hash FROM betterbase_meta.admin_users WHERE email = $1",
		[email],
	);
	const hashToCheck = admins[0]?.password_hash ?? FALLBACK_PASSWORD_HASH;
	const valid = await verifyPassword(password, hashToCheck);
	if (!valid) {
		return c.html(`<p style="color:red">Invalid credentials.</p>`);
	}
	if (admins.length === 0) {
		return c.html(`<p style="color:red">Invalid credentials.</p>`);
	}

	// Find and verify the device code
	const { rows: codes } = await pool.query(
		`SELECT user_code FROM betterbase_meta.device_codes
     WHERE user_code = $1 AND verified = FALSE AND expires_at > NOW()`,
		[userCode],
	);
	if (codes.length === 0) {
		return c.html(`<p style="color:red">Code not found or expired.</p>`);
	}

	// Mark verified, associate admin user
	await pool.query(
		`UPDATE betterbase_meta.device_codes
     SET verified = TRUE, admin_user_id = $1
     WHERE user_code = $2`,
		[admins[0].id, userCode],
	);

	return c.html(`<h2 style="color:green">✓ CLI authorized. You can close this tab.</h2>`);
});

// POST /device/token  — CLI polls this to get the token once verified
deviceRouter.post(
	"/token",
	zValidator("json", z.object({ device_code: z.string() })),
	async (c) => {
		const { device_code } = c.req.valid("json");
		const pool = getPool();

		const { rows } = await pool.query(
			`SELECT verified, admin_user_id, expires_at
     FROM betterbase_meta.device_codes
     WHERE device_code = $1`,
			[device_code],
		);

		if (rows.length === 0) {
			return c.json({ error: "invalid_device_code" }, 400);
		}

		const code = rows[0];

		if (new Date(code.expires_at) < new Date()) {
			return c.json({ error: "expired_token" }, 400);
		}

		if (!code.verified) {
			return c.json({ error: "authorization_pending" }, 202);
		}

		// Issue token, clean up device code
		const token = await signAdminToken(code.admin_user_id);
		await pool.query("DELETE FROM betterbase_meta.device_codes WHERE device_code = $1", [
			device_code,
		]);

		return c.json({ access_token: token, token_type: "Bearer" });
	},
);
