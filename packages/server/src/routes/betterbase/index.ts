import {
	DatabaseReader,
	DatabaseWriter,
	StorageCtx,
	formatError,
	lookupFunction,
} from "@betterbase/core";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { extractBearerToken, verifyAdminToken } from "../../lib/auth";
import { getPool } from "../../lib/db";
import { validateEnv } from "../../lib/env";

// Import WS handler for stats
import { getWSStats } from "./ws";

// Import S3 utilities
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const betterbaseRouter = new Hono();
const SAFE_PROJECT_SLUG = /^[a-z][a-z0-9_]{0,62}$/;
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"application/pdf",
	"text/plain",
]);

// All function calls: POST /betterbase/:kind/*
betterbaseRouter.post("/:kind/*", async (c) => {
	const kind = c.req.param("kind") as "queries" | "mutations" | "actions";
	const rest = c.req.path.replace(`/betterbase/${kind}/`, "");
	const path = `${kind}/${rest}`;

	const fn = lookupFunction(path);
	if (!fn) return c.json({ error: `Function not found: ${path}` }, 404);

	// Parse body
	let args: unknown;
	try {
		const body = await c.req.json();
		args = body.args ?? {};
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	// Validate args
	const parsed = (fn.handler as any)._args.safeParse(args);
	if (!parsed.success) {
		return c.json({ error: "Invalid arguments", details: parsed.error.flatten() }, 400);
	}

	// Auth context
	const token = extractBearerToken(c.req.header("Authorization"));
	const adminPayload = token ? await verifyAdminToken(token) : null;
	if (!adminPayload) return c.json({ error: "Unauthorized" }, 401);
	const authCtx = { userId: adminPayload?.sub ?? null, token };

	// Build DB context
	const pool = getPool();
	const projectSlug = c.req.header("X-Project-Slug") ?? "default";
	if (!SAFE_PROJECT_SLUG.test(projectSlug)) {
		return c.json({ error: "Invalid project slug" }, 400);
	}
	const dbSchema = `project_${projectSlug}`;

	try {
		let result: unknown;

		if (fn.kind === "query") {
			const storage = buildStorageCtx(pool, projectSlug);
			const ctx = { db: new DatabaseReader(pool, dbSchema), auth: authCtx, storage };
			result = await (fn.handler as any)._handler(ctx, parsed.data);
		} else if (fn.kind === "mutation") {
			const storage = buildStorageCtx(pool, projectSlug);
			const scheduler = buildSchedulerCtx(pool, projectSlug);
			const writer = new DatabaseWriter(pool, dbSchema);
			const ctx = { db: writer, auth: authCtx, storage, scheduler };
			result = await (fn.handler as any)._handler(ctx, parsed.data);
		} else {
			// action
			const ctx = buildActionCtx(pool, dbSchema, authCtx, projectSlug);
			result = await (fn.handler as any)._handler(ctx, parsed.data);
		}

		return c.json({ result });
	} catch (err: any) {
		console.error(`[betterbase] Error in ${path}:`, err);
		const formatted = formatError(err);
		return c.json(
			{
				error: formatted.message,
				code: formatted.code,
				suggestion: formatted.suggestion,
				docsUrl: formatted.docsUrl,
			},
			500,
		);
	}
});

// Storage context builder
function buildStorageCtx(pool: any, projectSlug: string): StorageCtx {
	const env = validateEnv();
	return new StorageCtx({
		pool,
		projectSlug,
		endpoint: env.STORAGE_ENDPOINT ?? "http://minio:9000",
		accessKey: env.STORAGE_ACCESS_KEY ?? "",
		secretKey: env.STORAGE_SECRET_KEY ?? "",
		bucket: env.STORAGE_BUCKET ?? "betterbase",
		publicBase: env.STORAGE_PUBLIC_BASE,
	});
}

// Scheduler context builder
class SchedulerCtx {
	constructor(
		private _pool: any,
		private _projectSlug: string,
	) {}

	async runAfter(delayMs: number, fn: any, args: any): Promise<string> {
		const runAt = new Date(Date.now() + delayMs);
		return this._schedule(fn, args, runAt);
	}

	async runAt(timestamp: Date, fn: any, args: any): Promise<string> {
		return this._schedule(fn, args, timestamp);
	}

	async cancel(jobId: string): Promise<void> {
		await this._pool.query(
			`UPDATE betterbase_meta.iac_scheduled_jobs
       SET status = 'cancelled'
       WHERE id = $1 AND project_slug = $2 AND status = 'pending'`,
			[jobId, this._projectSlug],
		);
	}

	private async _schedule(fn: any, args: unknown, runAt: Date): Promise<string> {
		const id = nanoid();
		const path = fn.__betterbasePath ?? "unknown";

		await this._pool.query(
			`INSERT INTO betterbase_meta.iac_scheduled_jobs
         (id, project_slug, function_path, args, run_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
			[id, this._projectSlug, path, JSON.stringify(args), runAt],
		);

		return id;
	}
}

function buildSchedulerCtx(pool: any, projectSlug: string) {
	return new SchedulerCtx(pool, projectSlug);
}

function buildActionCtx(pool: any, dbSchema: string, auth: any, projectSlug: string) {
	const storage = buildStorageCtx(pool, projectSlug);
	const scheduler = buildSchedulerCtx(pool, projectSlug);
	return {
		auth,
		storage,
		scheduler,
		runQuery: async (fn: any, args: any) => {
			const ctx = {
				db: new DatabaseReader(pool, dbSchema),
				auth,
				storage: buildStorageCtx(pool, projectSlug),
			};
			return fn._handler(ctx, args);
		},
		runMutation: async (fn: any, args: any) => {
			const ctx = {
				db: new DatabaseWriter(pool, dbSchema),
				auth,
				storage: buildStorageCtx(pool, projectSlug),
				scheduler: buildSchedulerCtx(pool, projectSlug),
			};
			return fn._handler(ctx, args);
		},
	};
}

// Direct browser upload endpoint: POST /betterbase/storage/generate-upload-url
betterbaseRouter.post("/storage/generate-upload-url", async (c) => {
	const token = extractBearerToken(c.req.header("Authorization"));
	const adminPayload = token ? await verifyAdminToken(token) : null;
	if (!adminPayload) return c.json({ error: "Unauthorized" }, 401);

	const { contentType, filename } = await c.req.json();
	const safeContentType =
		typeof contentType === "string" && ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType)
			? contentType
			: null;
	if (!safeContentType) return c.json({ error: "Unsupported content type" }, 400);

	const projectSlug = c.req.header("X-Project-Slug") ?? "default";
	if (!SAFE_PROJECT_SLUG.test(projectSlug)) {
		return c.json({ error: "Invalid project slug" }, 400);
	}
	const storageId = `st_${nanoid(20)}`;
	const ext = filename?.split(".").pop() ?? "";
	const s3Key = `project_${projectSlug}/${storageId}${ext ? "." + ext : ""}`;
	const env = validateEnv();

	const s3 = new S3Client({
		endpoint: env.STORAGE_ENDPOINT ?? "http://minio:9000",
		region: "us-east-1",
		credentials: {
			accessKeyId: env.STORAGE_ACCESS_KEY ?? "",
			secretAccessKey: env.STORAGE_SECRET_KEY ?? "",
		},
		forcePathStyle: true,
	});

	const uploadUrl = await getSignedUrl(
		s3,
		new PutObjectCommand({
			Bucket: env.STORAGE_BUCKET ?? "betterbase",
			Key: s3Key,
			ContentType: safeContentType,
		}),
		{ expiresIn: 300 },
	);

	// Record the pending upload in the DB so getUrl() works after upload
	const pool = getPool();
	await pool.query(
		`INSERT INTO "project_${projectSlug}"._iac_storage
       (storage_id, s3_key, bucket, content_type) VALUES ($1, $2, $3, $4)
     ON CONFLICT (storage_id) DO NOTHING`,
		[
			storageId,
			s3Key,
			env.STORAGE_BUCKET ?? "betterbase",
			safeContentType,
		],
	);

	return c.json({ storageId, uploadUrl });
});
