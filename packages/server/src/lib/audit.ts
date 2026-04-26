import { createHash } from "crypto";
import type { Pool } from "pg";
import { getPool } from "./db";

export type AuditAction =
	| "admin.login"
	| "admin.logout"
	| "admin.create"
	| "admin.delete"
	| "project.create"
	| "project.update"
	| "project.delete"
	| "project.user.ban"
	| "project.user.unban"
	| "project.user.delete"
	| "project.user.export"
	| "project.user.import"
	| "webhook.create"
	| "webhook.update"
	| "webhook.delete"
	| "webhook.retry"
	| "function.create"
	| "function.delete"
	| "function.deploy"
	| "storage.bucket.create"
	| "storage.bucket.delete"
	| "storage.object.delete"
	| "api_key.create"
	| "api_key.revoke"
	| "role.assign"
	| "role.revoke"
	| "settings.update"
	| "smtp.update"
	| "audit.export";

export interface AuditEntry {
	actorId?: string;
	actorEmail?: string;
	action: AuditAction;
	resourceType?: string;
	resourceId?: string;
	resourceName?: string;
	beforeData?: unknown;
	afterData?: unknown;
	ipAddress?: string;
	userAgent?: string;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
	const pool = getPool();
	// Fire and forget — never delay the response for audit logging
	pool
		.query(
			`INSERT INTO betterbase_meta.audit_log
        (actor_id, actor_email, action, resource_type, resource_id, resource_name,
         before_data, after_data, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			[
				entry.actorId ?? null,
				entry.actorEmail ?? null,
				entry.action,
				entry.resourceType ?? null,
				entry.resourceId ?? null,
				entry.resourceName ?? null,
				entry.beforeData ? JSON.stringify(entry.beforeData) : null,
				entry.afterData ? JSON.stringify(entry.afterData) : null,
				entry.ipAddress ?? null,
				entry.userAgent ?? null,
			],
		)
		.catch((err) => console.error("[audit] Failed to write log:", err));
}

// Helper: extract IP from Hono context
export function getClientIp(headers: Headers): string {
	const fromForwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	if (fromForwardedFor) return fromForwardedFor;

	const fromRealIp = headers.get("x-real-ip")?.trim();
	if (fromRealIp) return fromRealIp;

	const ua = headers.get("user-agent") ?? "";
	if (!ua) return "unknown";
	const fp = createHash("sha256").update(ua).digest("hex").slice(0, 16);
	return `ua:${fp}`;
}
