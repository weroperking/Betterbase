import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Pool } from "pg";
import { getPool } from "./db";
import { validateEnv } from "./env";

const getSecret = () => {
	const env = validateEnv();
	return new TextEncoder().encode(env.BETTERBASE_JWT_SECRET);
};

const TOKEN_EXPIRY = "8h";
const BCRYPT_ROUNDS = 12;

// --- Password ---

export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}

// --- JWT for admin sessions ---

export async function signAdminToken(adminUserId: string): Promise<string> {
	const env = validateEnv();
	return new SignJWT({ sub: adminUserId, type: "admin" })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(TOKEN_EXPIRY)
		.setIssuer(env.BETTERBASE_JWT_ISSUER)
		.setAudience(env.BETTERBASE_JWT_AUDIENCE)
		.setJti(randomUUID())
		.sign(getSecret());
}

export async function verifyAdminToken(
	token: string,
): Promise<{ sub: string; jti: string | undefined; exp?: number } | null> {
	// Step 1: Verify JWT signature and payload validity
	let payload: any;
	try {
		const env = validateEnv();
		const verified = await jwtVerify(token, getSecret(), {
			issuer: env.BETTERBASE_JWT_ISSUER,
			audience: env.BETTERBASE_JWT_AUDIENCE,
		});
		payload = verified.payload;

		if (payload.type !== "admin") return null;
		if (!payload.sub) return null;

		// Log warning if jti is missing
		if (!payload.jti) {
			console.warn(`[auth] Token missing jti claim (sub=${payload.sub})`);
		}
	} catch {
		// Cryptographic verification failed - invalid token
		return null;
	}

	// Step 2: Check revocation list (fail-closed on DB errors)
	// Skip revocation check if jti is missing
	if (payload.jti) {
		try {
			const pool = getPool();
			const { rows } = await pool.query(
				"SELECT 1 FROM betterbase_meta.revoked_admin_tokens WHERE jti = $1 LIMIT 1",
				[payload.jti],
			);
			if (rows.length > 0) return null;
		} catch (err) {
			// DB/query error - log and fail closed
			console.error(
				`[auth] DB error checking token revocation (jti=${payload.jti}, sub=${payload.sub}):`,
				err,
			);
			return null;
		}
	}

	return {
		sub: payload.sub as string,
		jti: payload.jti as string | undefined,
		exp: payload.exp as number | undefined
	};
}

// --- Middleware helper: extract + verify token from Authorization header ---

export function extractBearerToken(authHeader: string | undefined): string | null {
	if (!authHeader?.startsWith("Bearer ")) return null;
	return authHeader.slice(7);
}

// --- Seed initial admin on first start ---

export async function seedAdminUser(pool: Pool, email: string, password: string): Promise<void> {
	const { rows } = await pool.query("SELECT id FROM betterbase_meta.admin_users WHERE email = $1", [
		email,
	]);
	if (rows.length > 0) return; // Already exists

	const hash = await hashPassword(password);
	await pool.query(
		"INSERT INTO betterbase_meta.admin_users (email, password_hash) VALUES ($1, $2)",
		[email, hash],
	);
	console.log(`[auth] Seeded admin user: ${email}`);
}
