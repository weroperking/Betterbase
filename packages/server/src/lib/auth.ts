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
const NEGATIVE_CACHE_TTL_MS = 60_000;
const REVOCATION_CACHE_MAX = 10_000;

type RevocationCacheEntry = { revoked: boolean; expiresAtMs: number };
const revocationCache = new Map<string, RevocationCacheEntry>();

function getCachedRevocation(jti: string): boolean | null {
	const entry = revocationCache.get(jti);
	if (!entry) return null;
	if (entry.expiresAtMs <= Date.now()) {
		revocationCache.delete(jti);
		return null;
	}
	revocationCache.delete(jti);
	revocationCache.set(jti, entry);
	return entry.revoked;
}

function setCachedRevocation(jti: string, revoked: boolean, expiresAtMs: number) {
	revocationCache.set(jti, { revoked, expiresAtMs });
	if (revocationCache.size > REVOCATION_CACHE_MAX) {
		const oldestKey = revocationCache.keys().next().value;
		if (oldestKey) revocationCache.delete(oldestKey);
	}
}

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
): Promise<{ sub: string; jti: string; exp?: number } | null> {
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
	} catch {
		return null;
	}

	const tokenJti = typeof payload.jti === "string" ? payload.jti : undefined;
	const tokenExp = typeof payload.exp === "number" ? payload.exp : undefined;

	if (!tokenJti) return null;

	const cached = getCachedRevocation(tokenJti);
	if (cached !== null) {
		if (cached) return null;
		return { sub: payload.sub as string, jti: tokenJti, exp: tokenExp };
	}

	try {
		const pool = getPool();
		const { rows } = await pool.query<{ expires_at: string }>(
			"SELECT expires_at FROM betterbase_meta.revoked_admin_tokens WHERE jti = $1 LIMIT 1",
			[tokenJti],
		);
		if (rows.length > 0) {
			const revokedExpiry = new Date(rows[0].expires_at).getTime();
			setCachedRevocation(tokenJti, true, Number.isNaN(revokedExpiry) ? Date.now() + NEGATIVE_CACHE_TTL_MS : revokedExpiry);
			return null;
		}
		const negativeTtl = Math.min(
			tokenExp ? Math.max(tokenExp * 1000 - Date.now(), 5_000) : NEGATIVE_CACHE_TTL_MS,
			NEGATIVE_CACHE_TTL_MS,
		);
		setCachedRevocation(tokenJti, false, Date.now() + negativeTtl);
		return { sub: payload.sub as string, jti: tokenJti, exp: tokenExp };
	} catch (error) {
		console.error(
			`[auth] Failed to check token revocation for sub=${payload.sub} jti=${tokenJti}:`,
			error,
		);
		return null;
	}
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
