import { z } from "zod";

const EnvSchema = z.object({
	DATABASE_URL: z.string().min(1),
	BETTERBASE_JWT_SECRET: z.string().min(32, "JWT secret must be at least 32 characters"),
	BETTERBASE_ADMIN_EMAIL: z.string().email().optional(),
	BETTERBASE_ADMIN_PASSWORD: z.string().min(8).optional(),
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	STORAGE_ENDPOINT: z.string().optional(),
	STORAGE_ACCESS_KEY: z.string().optional(),
	STORAGE_SECRET_KEY: z.string().optional(),
	STORAGE_BUCKET: z.string().default("betterbase"),
	STORAGE_PUBLIC_BASE: z.string().url().optional(),
	CORS_ORIGINS: z.string().default("http://localhost:3000"),
	BETTERBASE_PUBLIC_URL: z.string().optional(),
	INNGEST_BASE_URL: z.string().url().optional(),
	INNGEST_SIGNING_KEY: z.string().optional(),
	INNGEST_EVENT_KEY: z.string().optional(),
	PORT: z.string().default("3000"),
	BETTERBASE_JWT_ISSUER: z.string().default("betterbase"),
	BETTERBASE_JWT_AUDIENCE: z.string().default("betterbase-admin"),
});

export type Env = z.infer<typeof EnvSchema>;

let validatedEnv: Env | null = null;

export function validateEnv(): Env {
	if (validatedEnv) return validatedEnv;
	const result = EnvSchema.safeParse(process.env);
	if (!result.success) {
		console.error("[env] Invalid environment variables:");
		console.error(result.error.flatten().fieldErrors);
		process.exit(1);
	}

	const { NODE_ENV, INNGEST_BASE_URL, INNGEST_SIGNING_KEY, INNGEST_EVENT_KEY } = result.data;

	// In production cloud mode, require Inngest secrets
	const isCloudMode = !INNGEST_BASE_URL || INNGEST_BASE_URL.includes("api.inngest.com");
	const isProduction = NODE_ENV === "production";

	if ((isCloudMode || isProduction) && !INNGEST_SIGNING_KEY) {
		console.error("[env] INNGEST_SIGNING_KEY is required in production/cloud mode");
		process.exit(1);
	}

	if ((isCloudMode || isProduction) && !INNGEST_EVENT_KEY) {
		console.error("[env] INNGEST_EVENT_KEY is required in production/cloud mode");
		process.exit(1);
	}

	// Set default for INNGEST_EVENT_KEY in non-production
	if (!INNGEST_EVENT_KEY) {
		result.data.INNGEST_EVENT_KEY = "betterbase-dev-event-key";
	}

	if (result.data.STORAGE_ENDPOINT) {
		if (!result.data.STORAGE_ACCESS_KEY || !result.data.STORAGE_SECRET_KEY) {
			console.error(
				"[env] STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY are required when STORAGE_ENDPOINT is set",
			);
			process.exit(1);
		}
	}

	validatedEnv = result.data;
	return validatedEnv;
}
