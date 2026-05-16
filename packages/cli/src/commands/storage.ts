/**
 * Storage Commands for BetterBase CLI
 *
 * Provides commands for initializing storage, listing buckets, and uploading files.
 */

import { existsSync as fsExistsSync, readFileSync as fsReadFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type StorageConfig,
	type StorageObject,
	type StorageProvider,
	createS3Adapter,
	createStorage,
} from "@betterbase/core/storage";
import inquirer from "inquirer";
import * as logger from "../utils/logger";
import { findConfigFile, loadConfig } from "../utils/config";

/**
 * Supported storage provider types
 */
type StorageProviderType = "s3" | "r2" | "backblaze" | "minio" | "skip" | "managed";

/**
 * Interface for storage credentials
 */
interface StorageCredentials {
	[key: string]: string;
}

/**
 * Find and load the BetterBase config file
 */
/**
 * Get storage config from environment variables
 */
function getStorageConfigFromEnv(): StorageConfig | null {
	const provider = process.env.STORAGE_PROVIDER;

	if (!provider || provider === "skip") {
		return null;
	}

	const bucket = process.env.STORAGE_BUCKET;
	if (!bucket) {
		return null;
	}

	const baseConfig = {
		bucket,
	};

	switch (provider) {
		case "s3":
			return {
				provider: "s3",
				bucket,
				region: process.env.STORAGE_REGION || "us-east-1",
				accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || "",
				secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || "",
			} as StorageConfig;

		case "r2":
			return {
				provider: "r2",
				bucket,
				accountId: process.env.STORAGE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || "",
				accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || "",
				secretAccessKey:
					process.env.STORAGE_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || "",
				endpoint: process.env.STORAGE_ENDPOINT || process.env.R2_ENDPOINT,
			} as StorageConfig;

		case "backblaze":
			return {
				provider: "backblaze",
				bucket,
				region: process.env.STORAGE_REGION || process.env.B2_REGION || "us-west-000",
				accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || process.env.B2_APPLICATION_KEY_ID || "",
				secretAccessKey:
					process.env.STORAGE_SECRET_ACCESS_KEY || process.env.B2_APPLICATION_KEY || "",
			} as StorageConfig;

		case "minio":
			return {
				provider: "minio",
				bucket,
				endpoint: process.env.STORAGE_ENDPOINT || process.env.MINIO_ENDPOINT || "localhost",
				port: Number.parseInt(process.env.STORAGE_PORT || process.env.MINIO_PORT || "9000", 10),
				useSSL: process.env.MINIO_USE_SSL !== "false",
				accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || process.env.MINIO_ACCESS_KEY || "",
				secretAccessKey:
					process.env.STORAGE_SECRET_ACCESS_KEY || process.env.MINIO_SECRET_KEY || "",
			} as StorageConfig;

		default:
			return null;
	}
}

/**
 * Prompt user to select a storage provider
 */
async function promptForStorageProvider(): Promise<StorageProviderType> {
	const response = await inquirer.prompt<{ value: string }>([
		{
			type: "list",
			name: "value",
			message: "Which storage provider would you like to use?",
			choices: [
				{ name: "AWS S3", value: "s3" },
				{ name: "Cloudflare R2", value: "r2" },
				{ name: "Backblaze B2", value: "backblaze" },
				{ name: "MinIO", value: "minio" },
				{ name: "Skip (no storage)", value: "skip" },
				{ name: "Managed by BetterBase (coming soon)", value: "managed" },
			],
			default: "s3",
		},
	]);

	return response.value as StorageProviderType;
}

/**
 * Prompt for S3-specific credentials
 */
async function promptForS3Credentials(): Promise<StorageCredentials> {
	const responses = await inquirer.prompt<{
		accessKeyId: string;
		secretAccessKey: string;
		region: string;
		bucket: string;
	}>([
		{
			type: "input",
			name: "accessKeyId",
			message: "AWS_ACCESS_KEY_ID:",
			validate: (input) => input.trim().length > 0 || "Access Key ID is required",
		},
		{
			type: "input",
			name: "secretAccessKey",
			message: "AWS_SECRET_ACCESS_KEY:",
			validate: (input) => input.trim().length > 0 || "Secret Access Key is required",
		},
		{
			type: "input",
			name: "region",
			message: "AWS_REGION:",
			default: "us-east-1",
		},
		{
			type: "input",
			name: "bucket",
			message: "S3 Bucket name:",
			validate: (input) => input.trim().length > 0 || "Bucket name is required",
		},
	]);

	return {
		AWS_ACCESS_KEY_ID: responses.accessKeyId,
		AWS_SECRET_ACCESS_KEY: responses.secretAccessKey,
		AWS_REGION: responses.region,
		STORAGE_BUCKET: responses.bucket,
	};
}

/**
 * Prompt for R2-specific credentials
 */
async function promptForR2Credentials(): Promise<StorageCredentials> {
	const responses = await inquirer.prompt<{
		accountId: string;
		accessKeyId: string;
		secretAccessKey: string;
		bucket: string;
	}>([
		{
			type: "input",
			name: "accountId",
			message: "R2_ACCOUNT_ID (Cloudflare account ID):",
			validate: (input) => input.trim().length > 0 || "Account ID is required",
		},
		{
			type: "input",
			name: "accessKeyId",
			message: "R2_ACCESS_KEY_ID:",
			validate: (input) => input.trim().length > 0 || "Access Key ID is required",
		},
		{
			type: "input",
			name: "secretAccessKey",
			message: "R2_SECRET_ACCESS_KEY:",
			validate: (input) => input.trim().length > 0 || "Secret Access Key is required",
		},
		{
			type: "input",
			name: "bucket",
			message: "R2 Bucket name:",
			validate: (input) => input.trim().length > 0 || "Bucket name is required",
		},
	]);

	return {
		R2_ACCOUNT_ID: responses.accountId,
		R2_ACCESS_KEY_ID: responses.accessKeyId,
		R2_SECRET_ACCESS_KEY: responses.secretAccessKey,
		STORAGE_BUCKET: responses.bucket,
	};
}

/**
 * Prompt for Backblaze-specific credentials
 */
async function promptForBackblazeCredentials(): Promise<StorageCredentials> {
	const responses = await inquirer.prompt<{
		applicationKeyId: string;
		applicationKey: string;
		bucketName: string;
		region: string;
	}>([
		{
			type: "input",
			name: "applicationKeyId",
			message: "B2_APPLICATION_KEY_ID:",
			validate: (input) => input.trim().length > 0 || "Application Key ID is required",
		},
		{
			type: "input",
			name: "applicationKey",
			message: "B2_APPLICATION_KEY:",
			validate: (input) => input.trim().length > 0 || "Application Key is required",
		},
		{
			type: "input",
			name: "bucketName",
			message: "B2_BUCKET_NAME:",
			validate: (input) => input.trim().length > 0 || "Bucket name is required",
		},
		{
			type: "input",
			name: "region",
			message: "B2_REGION (e.g., us-west-000):",
			default: "us-west-000",
		},
	]);

	return {
		B2_APPLICATION_KEY_ID: responses.applicationKeyId,
		B2_APPLICATION_KEY: responses.applicationKey,
		B2_BUCKET_NAME: responses.bucketName,
		B2_REGION: responses.region,
		STORAGE_BUCKET: responses.bucketName,
	};
}

/**
 * Prompt for MinIO-specific credentials
 */
async function promptForMinioCredentials(): Promise<StorageCredentials> {
	const responses = await inquirer.prompt<{
		accessKey: string;
		secretKey: string;
		endpoint: string;
		port: string;
		bucket: string;
	}>([
		{
			type: "input",
			name: "accessKey",
			message: "MINIO_ACCESS_KEY:",
			validate: (input) => input.trim().length > 0 || "Access Key is required",
		},
		{
			type: "input",
			name: "secretKey",
			message: "MINIO_SECRET_KEY:",
			validate: (input) => input.trim().length > 0 || "Secret Key is required",
		},
		{
			type: "input",
			name: "endpoint",
			message: "MINIO_ENDPOINT (e.g., localhost):",
			default: "localhost",
		},
		{
			type: "input",
			name: "port",
			message: "MINIO_PORT:",
			default: "9000",
		},
		{
			type: "input",
			name: "bucket",
			message: "Bucket name:",
			validate: (input) => input.trim().length > 0 || "Bucket name is required",
		},
	]);

	return {
		MINIO_ACCESS_KEY: responses.accessKey,
		MINIO_SECRET_KEY: responses.secretKey,
		MINIO_ENDPOINT: responses.endpoint,
		MINIO_PORT: responses.port,
		STORAGE_BUCKET: responses.bucket,
	};
}

/**
 * Generate storage config block for betterbase.config.ts
 */
function generateStorageConfigBlock(
	provider: StorageProviderType,
	credentials: StorageCredentials,
): string {
	const bucket = credentials.STORAGE_BUCKET;

	switch (provider) {
		case "s3":
			return `  storage: {
    provider: 's3',
    bucket: '${bucket}',
    region: '${credentials.AWS_REGION || "us-east-1"}',
  },`;

		case "r2":
			return `  storage: {
    provider: 'r2',
    bucket: '${bucket}',
    region: 'auto',
  },`;

		case "backblaze":
			return `  storage: {
    provider: 'backblaze',
    bucket: '${bucket}',
    region: '${credentials.B2_REGION || "us-west-000"}',
  },`;

		case "minio":
			return `  storage: {
    provider: 'minio',
    bucket: '${bucket}',
    endpoint: '${credentials.MINIO_ENDPOINT || "localhost"}',
    port: ${Number.parseInt(credentials.MINIO_PORT || "9000", 10)},
  },`;

		default:
			return "";
	}
}

/**
 * Generate env var content for storage
 */
function generateStorageEnvContent(
	provider: StorageProviderType,
	credentials: StorageCredentials,
): string {
	let content = `\n# Storage (${provider})\n`;
	content += `STORAGE_PROVIDER=${provider}\n`;
	content += `STORAGE_BUCKET=${credentials.STORAGE_BUCKET || ""}\n`;

	switch (provider) {
		case "s3":
			content += `AWS_ACCESS_KEY_ID=${credentials.AWS_ACCESS_KEY_ID || ""}\n`;
			content += `AWS_SECRET_ACCESS_KEY=${credentials.AWS_SECRET_ACCESS_KEY || ""}\n`;
			content += `AWS_REGION=${credentials.AWS_REGION || "us-east-1"}\n`;
			break;

		case "r2":
			content += `R2_ACCOUNT_ID=${credentials.R2_ACCOUNT_ID || ""}\n`;
			content += `R2_ACCESS_KEY_ID=${credentials.R2_ACCESS_KEY_ID || ""}\n`;
			content += `R2_SECRET_ACCESS_KEY=${credentials.R2_SECRET_ACCESS_KEY || ""}\n`;
			break;

		case "backblaze":
			content += `B2_APPLICATION_KEY_ID=${credentials.B2_APPLICATION_KEY_ID || ""}\n`;
			content += `B2_APPLICATION_KEY=${credentials.B2_APPLICATION_KEY || ""}\n`;
			content += `B2_BUCKET_NAME=${credentials.B2_BUCKET_NAME || ""}\n`;
			content += `B2_REGION=${credentials.B2_REGION || "us-west-000"}\n`;
			break;

		case "minio":
			content += `MINIO_ACCESS_KEY=${credentials.MINIO_ACCESS_KEY || ""}\n`;
			content += `MINIO_SECRET_KEY=${credentials.MINIO_SECRET_KEY || ""}\n`;
			content += `MINIO_ENDPOINT=${credentials.MINIO_ENDPOINT || "localhost"}\n`;
			content += `MINIO_PORT=${credentials.MINIO_PORT || "9000"}\n`;
			break;
	}

	return content;
}

/**
 * Generate .gitignore patterns for storage env vars
 */
function generateGitignorePatterns(provider: StorageProviderType): string[] {
	const patterns: string[] = ["STORAGE_BUCKET="];

	switch (provider) {
		case "s3":
			return [...patterns, "AWS_ACCESS_KEY_ID=", "AWS_SECRET_ACCESS_KEY=", "AWS_REGION="];
		case "r2":
			return [...patterns, "R2_ACCOUNT_ID=", "R2_ACCESS_KEY_ID=", "R2_SECRET_ACCESS_KEY="];
		case "backblaze":
			return [
				...patterns,
				"B2_APPLICATION_KEY_ID=",
				"B2_APPLICATION_KEY=",
				"B2_BUCKET_NAME=",
				"B2_REGION=",
			];
		case "minio":
			return [
				...patterns,
				"MINIO_ACCESS_KEY=",
				"MINIO_SECRET_KEY=",
				"MINIO_ENDPOINT=",
				"MINIO_PORT=",
			];
		default:
			return patterns;
	}
}

/**
 * Update .gitignore with storage env var patterns
 */
async function updateGitignore(projectRoot: string, provider: StorageProviderType): Promise<void> {
	const gitignorePath = path.join(projectRoot, ".gitignore");

	if (!fsExistsSync(gitignorePath)) {
		return;
	}

	const currentContent = fsReadFileSync(gitignorePath, "utf-8");
	const patterns = generateGitignorePatterns(provider);

	let updatedContent = currentContent;

	for (const pattern of patterns) {
		if (!currentContent.includes(pattern)) {
			updatedContent += `\n# Storage env vars\n${pattern}`;
		}
	}

	if (updatedContent !== currentContent) {
		await writeFile(gitignorePath, updatedContent);
		logger.success("Updated .gitignore with storage env var patterns");
	}
}

/**
 * Update the betterbase.config.ts with storage config
 */
async function updateConfigFile(
	projectRoot: string,
	provider: StorageProviderType,
	credentials: StorageCredentials,
): Promise<void> {
	const configPath = await findConfigFile(projectRoot);

	if (!configPath) {
		logger.warn('No betterbase.config.ts found. Please run "bb init" first.');
		return;
	}

	try {
		const currentContent = fsReadFileSync(configPath, "utf-8");
		const storageBlock = generateStorageConfigBlock(provider, credentials);

		// Check if storage config already exists
		if (currentContent.includes("storage:")) {
			// Replace existing storage block
			const storageBlockRegex = /\n?\s*storage:\s*\{[^}]*\}/;
			const newContent = currentContent.replace(storageBlockRegex, `\n${storageBlock}`);
			await writeFile(configPath, newContent);
		} else {
			// Add storage block before the closing brace
			const newContent = currentContent.replace(
				/\}\s* satisfies BetterBaseConfig/,
				`,\n${storageBlock}\n} satisfies BetterBaseConfig`,
			);
			await writeFile(configPath, newContent);
		}

		logger.success("Updated betterbase.config.ts with storage configuration");
	} catch (error) {
		logger.error(
			`Failed to update config: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Update .env file with storage credentials
 */
async function updateEnvFile(
	projectRoot: string,
	provider: StorageProviderType,
	credentials: StorageCredentials,
): Promise<void> {
	const envPath = path.join(projectRoot, ".env");

	if (!fsExistsSync(envPath)) {
		logger.warn("No .env file found");
		return;
	}

	try {
		const currentContent = fsReadFileSync(envPath, "utf-8");
		const storageEnvContent = generateStorageEnvContent(provider, credentials);

		// Check if storage section already exists
		if (currentContent.includes("STORAGE_PROVIDER=")) {
			logger.info("Storage already configured in .env");
			return;
		}

		const newContent = currentContent.trimEnd() + storageEnvContent;
		await writeFile(envPath, newContent);
		logger.success("Updated .env with storage credentials");
	} catch (error) {
		logger.error(
			`Failed to update .env: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Run the storage init command
 */
export async function runStorageInitCommand(projectRoot: string = process.cwd()): Promise<void> {
	logger.info("🗄️ Setting up storage...");

	// Prompt for provider selection
	const provider = await promptForStorageProvider();

	// Handle skip
	if (provider === "skip") {
		logger.info("Storage setup skipped.");
		return;
	}

	// Handle managed (coming soon)
	if (provider === "managed") {
		console.log("");
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		console.log("Coming soon — managed storage launching in a future release.");
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		console.log("");
		return;
	}

	// Prompt for credentials based on provider
	let credentials: StorageCredentials = {};

	switch (provider) {
		case "s3":
			credentials = await promptForS3Credentials();
			break;
		case "r2":
			credentials = await promptForR2Credentials();
			break;
		case "backblaze":
			credentials = await promptForBackblazeCredentials();
			break;
		case "minio":
			credentials = await promptForMinioCredentials();
			break;
	}

	// Validate bucket name
	if (!credentials.STORAGE_BUCKET) {
		logger.error("Bucket name is required");
		return;
	}

	// Update config file
	await updateConfigFile(projectRoot, provider, credentials);

	// Update .env file
	await updateEnvFile(projectRoot, provider, credentials);

	// Update .gitignore
	await updateGitignore(projectRoot, provider);

	logger.success("✅ Storage setup complete!");
	logger.info("Next steps:");
	logger.info(`1. Your storage provider is set to: ${provider}`);
	logger.info(`2. Bucket: ${credentials.STORAGE_BUCKET}`);
	logger.info('3. Run "bb storage buckets list" to verify connection');
	logger.info('4. Run "bb storage upload <file>" to upload files');
}

/**
 * Run the storage buckets list command
 */
export async function runStorageBucketsListCommand(
	projectRoot: string = process.cwd(),
): Promise<void> {
	logger.info("📋 Listing storage buckets...");

	// Load config
	const config = await loadConfig(projectRoot);

	// Try to get storage config from config file or env
	let storageConfig: StorageConfig | null = null;

	if (config?.storage) {
		// Build config from file
		const provider = config.storage.provider;
		const bucket = config.storage.bucket;
		const region = config.storage.region;
		const endpoint = config.storage.endpoint;

		// Get credentials from env
		const accessKeyId =
			process.env.STORAGE_ACCESS_KEY ||
			process.env.AWS_ACCESS_KEY_ID ||
			process.env.R2_ACCESS_KEY_ID ||
			process.env.B2_APPLICATION_KEY_ID ||
			process.env.MINIO_ACCESS_KEY ||
			"";

		const secretAccessKey =
			process.env.STORAGE_SECRET_KEY ||
			process.env.AWS_SECRET_ACCESS_KEY ||
			process.env.R2_SECRET_ACCESS_KEY ||
			process.env.B2_APPLICATION_KEY ||
			process.env.MINIO_SECRET_KEY ||
			"";

		if (!accessKeyId || !secretAccessKey) {
			logger.error("Storage credentials not found in environment variables");
			logger.info("Please ensure your .env file has the required credentials");
			return;
		}

		storageConfig = {
			provider,
			bucket,
			region,
			endpoint,
			accessKeyId,
			secretAccessKey,
		} as StorageConfig;
	} else {
		// Try to get from env vars directly
		storageConfig = getStorageConfigFromEnv();
	}

	if (!storageConfig) {
		logger.error('Storage not configured. Run "bb storage init" first.');
		return;
	}

	try {
		// Create storage adapter
		const adapter = createS3Adapter(storageConfig);

		// List objects in the bucket
		const objects = await adapter.listObjects(storageConfig.bucket);

		if (objects.length === 0) {
			logger.info(`Bucket "${storageConfig.bucket}" is empty`);
			return;
		}

		console.log("");
		console.log(`Bucket: ${storageConfig.bucket}`);
		console.log(`Provider: ${storageConfig.provider}`);

		// Get region based on provider type
		let region = "N/A";
		if ("region" in storageConfig) {
			region = (storageConfig as { region?: string }).region || "N/A";
		} else if ("accountId" in storageConfig) {
			region = "auto (R2)";
		} else if ("endpoint" in storageConfig) {
			region = (storageConfig as { endpoint?: string }).endpoint || "N/A";
		}
		console.log(`Region: ${region}`);
		console.log("");
		console.log("Objects:");
		console.log("─".repeat(80));

		for (const obj of objects) {
			const size = formatBytes(obj.size);
			const date = obj.lastModified.toISOString().split("T")[0];
			console.log(`  ${obj.key.padEnd(40)} ${size.padStart(10)} ${date}`);
		}

		console.log("─".repeat(80));
		console.log(`Total: ${objects.length} object(s)`);
	} catch (error) {
		logger.error(
			`Failed to list buckets: ${error instanceof Error ? error.message : String(error)}`,
		);
		logger.info("Check your credentials and try again");
	}
}

/**
 * Run the storage upload command
 */
export async function runStorageUploadCommand(
	filePath: string,
	options: { bucket?: string; path?: string; projectRoot?: string } = {},
): Promise<void> {
	const { bucket: bucketOption, path: remotePath, projectRoot = process.cwd() } = options;

	if (!filePath) {
		logger.error("File path is required");
		return;
	}

	// Resolve the local file path
	const localFilePath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);

	if (!fsExistsSync(localFilePath)) {
		logger.error(`File not found: ${localFilePath}`);
		return;
	}

	logger.info(`📤 Uploading ${filePath}...`);

	// Load config
	const config = await loadConfig(projectRoot);

	// Try to get storage config
	let storageConfig: StorageConfig | null = null;
	let bucket = bucketOption;

	if (config?.storage) {
		const provider = config.storage.provider;
		const configBucket = config.storage.bucket;
		const region = config.storage.region;
		const endpoint = config.storage.endpoint;

		bucket = bucket || configBucket;

		const accessKeyId =
			process.env.STORAGE_ACCESS_KEY ||
			process.env.AWS_ACCESS_KEY_ID ||
			process.env.R2_ACCESS_KEY_ID ||
			process.env.B2_APPLICATION_KEY_ID ||
			process.env.MINIO_ACCESS_KEY ||
			"";

		const secretAccessKey =
			process.env.STORAGE_SECRET_KEY ||
			process.env.AWS_SECRET_ACCESS_KEY ||
			process.env.R2_SECRET_ACCESS_KEY ||
			process.env.B2_APPLICATION_KEY ||
			process.env.MINIO_SECRET_KEY ||
			"";

		if (!accessKeyId || !secretAccessKey) {
			logger.error("Storage credentials not found in environment variables");
			return;
		}

		storageConfig = {
			provider,
			bucket,
			region,
			endpoint,
			accessKeyId,
			secretAccessKey,
		} as StorageConfig;
	} else {
		storageConfig = getStorageConfigFromEnv();
		bucket = bucket || storageConfig?.bucket;
	}

	if (!storageConfig || !bucket) {
		logger.error('Storage not configured. Run "bb storage init" first.');
		return;
	}

	try {
		// Read the local file
		const fileContent = await readFile(localFilePath);
		const fileName = path.basename(localFilePath);
		const remoteFilePath = remotePath || fileName;

		// Determine content type
		const contentType = getContentType(fileName);

		// Show progress
		logger.info(`Uploading to bucket: ${bucket}`);
		logger.info(`Remote path: ${remoteFilePath}`);
		console.log(`Progress: ${formatBytes(fileContent.length)}`);

		// Create storage adapter and upload
		const adapter = createS3Adapter(storageConfig);

		const result = await adapter.upload(bucket, remoteFilePath, fileContent, {
			contentType,
		});

		// Get public URL
		const publicUrl = adapter.getPublicUrl(bucket, remoteFilePath);

		console.log("");
		logger.success("✅ Upload complete!");
		console.log("");
		console.log("File details:");
		console.log(`  Key: ${result.key}`);
		console.log(`  Size: ${formatBytes(result.size)}`);
		console.log(`  Content-Type: ${result.contentType || "N/A"}`);
		console.log("");
		console.log("Public URL:");
		console.log(`  ${publicUrl}`);

		// Also try to generate a signed URL
		try {
			const signedUrl = await adapter.createSignedUrl(bucket, remoteFilePath, {
				expiresIn: 3600,
			});
			console.log("");
			console.log("Signed URL (valid for 1 hour):");
			console.log(`  ${signedUrl}`);
		} catch {
			// Signed URL generation might fail for some configs
		}
	} catch (error) {
		logger.error(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Get content type from file extension
 */
function getContentType(fileName: string): string {
	const ext = path.extname(fileName).toLowerCase();
	const contentTypes: Record<string, string> = {
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".png": "image/png",
		".gif": "image/gif",
		".webp": "image/webp",
		".svg": "image/svg+xml",
		".ico": "image/x-icon",
		".pdf": "application/pdf",
		".zip": "application/zip",
		".tar": "application/x-tar",
		".gz": "application/gzip",
		".json": "application/json",
		".xml": "application/xml",
		".html": "text/html",
		".css": "text/css",
		".js": "application/javascript",
		".ts": "application/typescript",
		".txt": "text/plain",
		".md": "text/markdown",
	};

	return contentTypes[ext] || "application/octet-stream";
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";

	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}
