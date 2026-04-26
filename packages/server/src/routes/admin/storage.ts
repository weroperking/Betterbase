import {
	CreateBucketCommand,
	DeleteBucketCommand,
	ListBucketsCommand,
	ListObjectsV2Command,
	S3Client,
} from "@aws-sdk/client-s3";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { validateEnv } from "../../lib/env";

function getS3Client(): S3Client {
	const env = validateEnv();
	if (!env.STORAGE_ENDPOINT || !env.STORAGE_ACCESS_KEY || !env.STORAGE_SECRET_KEY) {
		throw new Error("Storage is not configured. Set STORAGE_ENDPOINT, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY.");
	}
	return new S3Client({
		endpoint: env.STORAGE_ENDPOINT,
		region: "us-east-1",
		credentials: {
			accessKeyId: env.STORAGE_ACCESS_KEY,
			secretAccessKey: env.STORAGE_SECRET_KEY,
		},
		forcePathStyle: true, // Required for MinIO
	});
}

export const storageRoutes = new Hono();

// GET /admin/storage/buckets
storageRoutes.get("/buckets", async (c) => {
	const client = getS3Client();
	const { Buckets } = await client.send(new ListBucketsCommand({}));
	return c.json({ buckets: Buckets ?? [] });
});

// POST /admin/storage/buckets
storageRoutes.post(
	"/buckets",
	zValidator("json", z.object({ name: z.string().min(1) })),
	async (c) => {
		const { name } = c.req.valid("json");
		const client = getS3Client();
		await client.send(new CreateBucketCommand({ Bucket: name }));
		return c.json({ bucket: { name } }, 201);
	},
);

// DELETE /admin/storage/buckets/:name
storageRoutes.delete("/buckets/:name", async (c) => {
	const client = getS3Client();
	await client.send(new DeleteBucketCommand({ Bucket: c.req.param("name") }));
	return c.json({ success: true });
});

// GET /admin/storage/buckets/:name/objects
storageRoutes.get("/buckets/:name/objects", async (c) => {
	const client = getS3Client();
	const { Contents } = await client.send(new ListObjectsV2Command({ Bucket: c.req.param("name") }));
	return c.json({ objects: Contents ?? [] });
});
