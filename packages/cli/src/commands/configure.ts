import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { BetterBaseConfigSchema } from "@betterbase/core";
import * as logger from "../utils/logger";
import { listDir, statePath } from "../utils/project-state";
import { z } from "zod";

const configureOptionsSchema = z.object({
	projectRoot: z.string().optional(),
	provider: z.enum(["postgres", "neon", "supabase", "planetscale", "turso", "managed"]).optional(),
	"database-url": z.string().optional(),
	"turso-url": z.string().optional(),
	"turso-auth-token": z.string().optional(),
	port: z.coerce.number().optional(),
	"auto-register": z.boolean().optional(),
	dryRun: z.boolean().optional(),
	json: z.boolean().optional(),
});

export type ConfigureCommandOptions = z.infer<typeof configureOptionsSchema>;

interface ConfigChange {
	file: string;
	key: string;
	oldValue: string | null;
	newValue: string;
}

async function readConfigFile(projectRoot: string): Promise<string | null> {
	const configPath = path.join(projectRoot, "betterbase.config.ts");
	if (!existsSync(configPath)) return null;
	return readFile(configPath, "utf-8");
}

async function writeConfigFile(projectRoot: string, content: string): Promise<void> {
	const configPath = path.join(projectRoot, "betterbase.config.ts");
	await writeFile(configPath, content);
}

function getCurrentValue(content: string, key: string): string | null {
	const regex = new RegExp(`^(\t+)${key}:\\s*(.*)$`, "gm");
	const match = regex.exec(content);
	if (match) return match[2].trim();
	return null;
}

function updateConfigValue(content: string, key: string, value: string): string {
	const regex = new RegExp(`^(\t+)${key}:\\s*(.*)$`, "gm");
	if (regex.test(content)) {
		return content.replace(regex, (_, indent) => `${indent}${key}: ${value}`);
	}
	return content;
}

async function readEnvFile(projectRoot: string): Promise<Map<string, string>> {
	const envPath = path.join(projectRoot, ".env");
	const envVars = new Map<string, string>();
	if (!existsSync(envPath)) return envVars;
	const content = await readFile(envPath, "utf-8");
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIndex = trimmed.indexOf("=");
		if (eqIndex === -1) continue;
		const key = trimmed.slice(0, eqIndex).trim();
		const value = trimmed.slice(eqIndex + 1).trim();
		envVars.set(key, value);
	}
	return envVars;
}

function resolveEnvRef(value: string, envVars: Map<string, string>): string {
	const match = value.match(/^process\.env\.(\w+)$/);
	if (!match) return value;
	return envVars.get(match[1]) ?? "";
}

function extractConfigValues(configContent: string, envVars: Map<string, string>): Record<string, unknown> {
	const config: Record<string, unknown> = {};

	const projectMatch = configContent.match(/project:\s*\{[^}]*name:\s*["']([^"']+)["']/);
	if (projectMatch) {
		config.project = { name: projectMatch[1] };
	}

	const providerMatch = configContent.match(/provider:\s*\{([^}]*)\}/s);
	if (providerMatch) {
		const providerBlock = providerMatch[1];
		const provider: Record<string, unknown> = {};

		const typeMatch = providerBlock.match(/type:\s*["']([^"']+)["']/);
		if (typeMatch) provider.type = typeMatch[1];

		const connMatch = providerBlock.match(/connectionString:\s*(.+?)(?:,|\n|$)/);
		if (connMatch) provider.connectionString = resolveEnvRef(connMatch[1].trim(), envVars);

		const urlMatch = providerBlock.match(/url:\s*(.+?)(?:,|\n|$)/);
		if (urlMatch) provider.url = resolveEnvRef(urlMatch[1].trim(), envVars);

		const authMatch = providerBlock.match(/authToken:\s*(.+?)(?:,|\n|$)/);
		if (authMatch) provider.authToken = resolveEnvRef(authMatch[1].trim(), envVars);

		config.provider = provider;
	}

	return config;
}

function validateEnvVars(projectRoot: string, configContent: string, envVars: Map<string, string>): string[] {
	const errors: string[] = [];

	const portMatch = configContent.match(/^(\t+)port:\s*(.+)$/m);
	if (portMatch) {
		const portValue = portMatch[2].trim();
		const resolvedPort = resolveEnvRef(portValue, envVars);
		if (resolvedPort && isNaN(Number(resolvedPort))) {
			errors.push(`PORT value "${resolvedPort}" is not a valid number`);
		}
	}

	const envPort = envVars.get("PORT");
	if (envPort && isNaN(Number(envPort))) {
		errors.push(`PORT value "${envPort}" in .env is not a valid number`);
	}

	const providerTypeMatch = configContent.match(/type:\s*["']([^"']+)["']/);
	const providerType = providerTypeMatch?.[1];

	if (providerType && providerType !== "managed") {
		const hasConnectionString = configContent.includes("connectionString:") && envVars.has("DATABASE_URL");
		const hasConnectionStringLiteral = configContent.match(/connectionString:\s*["'][^"']+["']/);

		if (providerType === "turso") {
			if (!envVars.has("TURSO_URL") && !configContent.includes("url:")) {
				errors.push('Turso provider requires TURSO_URL to be set in .env or config');
			}
			if (!envVars.has("TURSO_AUTH_TOKEN") && !configContent.includes("authToken:")) {
				errors.push('Turso provider requires TURSO_AUTH_TOKEN to be set in .env or config');
			}
		} else if (!hasConnectionString && !hasConnectionStringLiteral) {
			errors.push(`Provider "${providerType}" requires DATABASE_URL to be set in .env or connectionString in config`);
		}
	}

	return errors;
}

async function validatePostChangeConfig(projectRoot: string): Promise<string[]> {
	const errors: string[] = [];

	const configContent = await readConfigFile(projectRoot);
	if (!configContent) {
		errors.push("Could not read betterbase.config.ts for validation");
		return errors;
	}

	const envVars = await readEnvFile(projectRoot);
	const configValues = extractConfigValues(configContent, envVars);

	const result = BetterBaseConfigSchema.safeParse(configValues);
	if (!result.success) {
		for (const issue of result.error.issues) {
			const path = issue.path.length > 0 ? issue.path.join(".") : "root";
			errors.push(`${path}: ${issue.message}`);
		}
	}

	const envErrors = validateEnvVars(projectRoot, configContent, envVars);
	errors.push(...envErrors);

	return errors;
}

function getTimestamp(): string {
	const d = new Date();
	return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
}

async function createBackup(projectRoot: string, filename: string): Promise<string> {
	const sourcePath = path.join(projectRoot, filename);
	if (!existsSync(sourcePath)) return "";
	const backupDir = path.join(projectRoot, "betterbase", ".backups");
	await mkdir(backupDir, { recursive: true });
	const backupName = `${filename}.bak.${getTimestamp()}`;
	const backupPath = path.join(backupDir, backupName);
	await copyFile(sourcePath, backupPath);
	return backupPath;
}

async function appendConfigLog(projectRoot: string, entry: object): Promise<void> {
	const logDir = path.join(projectRoot, "betterbase");
	const logPath = path.join(logDir, ".bb-configure-log.json");
	await mkdir(logDir, { recursive: true });
	let logContent: object[];
	try {
		const existing = await readFile(logPath, "utf-8");
		logContent = JSON.parse(existing);
		if (!Array.isArray(logContent)) {
			logContent = [];
		}
	} catch {
		logContent = [];
	}
	logContent.push(entry);
	await writeFile(logPath, JSON.stringify(logContent, null, 2), "utf-8");
}

type Change = { description: string; key: string; oldValue: string; newValue: string; file: string };

const BACKUP_PREFIX = "betterbase.config.ts.bak.";

export async function runConfigureCommand(rawOptions: ConfigureCommandOptions): Promise<void> {
	const options = configureOptionsSchema.parse(rawOptions);
	const projectRoot = options.projectRoot ?? process.cwd();
	const outputJson = options.json ?? false;

	if (!outputJson) {
		logger.blank();
		console.log(chalk.bold("  bb configure") + chalk.dim(" — configure your BetterBase project"));
		if (options.dryRun) {
			console.log(chalk.dim("  (dry-run — no files will be modified)"));
		}
		logger.blank();
	}

	const configPath = path.join(projectRoot, "betterbase.config.ts");
	if (!existsSync(configPath)) {
		if (outputJson) {
			console.error(JSON.stringify([{ error: "No betterbase.config.ts found. Run bb init to create a project first." }]));
			process.exit(1);
		}
		logger.error("No betterbase.config.ts found. Run bb init to create a project first.");
		process.exit(1);
	}

	let configContent = await readConfigFile(projectRoot);
	if (!configContent) {
		if (outputJson) {
			console.error(JSON.stringify([{ error: "Could not read betterbase.config.ts" }]));
			process.exit(1);
		}
		logger.error("Could not read betterbase.config.ts");
		process.exit(1);
	}

	const changes: Change[] = [];

	if (options.provider) {
		const oldMatch = configContent.match(/^\t+type:\s*(.*)$/m);
		const oldValue = oldMatch?.[1]?.trim() ?? "(not set)";
		const newValue = `"${options.provider}"`;
		changes.push({ description: `Provider set to ${options.provider}`, key: "type", oldValue, newValue, file: "betterbase.config.ts" });
		if (!options.dryRun) {
			configContent = updateConfigValue(configContent, "type", newValue);
		}
	}

	if (options["database-url"]) {
		const oldMatch = configContent.match(/^\t+connectionString:\s*(.*)$/m);
		const oldValue = oldMatch?.[1]?.trim() ?? "(not set)";
		const newValue = options["database-url"];
		changes.push({ description: "Database URL updated", key: "connectionString", oldValue, newValue, file: "betterbase.config.ts" });
		if (!options.dryRun) {
			configContent = updateConfigValue(configContent, "connectionString", newValue);
		}
	}

	if (options["turso-url"]) {
		const oldMatch = configContent.match(/^\t+url:\s*(.*)$/m);
		const oldValue = oldMatch?.[1]?.trim() ?? "(not set)";
		const newValue = options["turso-url"];
		changes.push({ description: "Turso URL updated", key: "url", oldValue, newValue, file: "betterbase.config.ts" });
		if (!options.dryRun) {
			configContent = updateConfigValue(configContent, "url", newValue);
		}
	}

	if (options["turso-auth-token"]) {
		const oldMatch = configContent.match(/^\t+authToken:\s*(.*)$/m);
		const oldValue = oldMatch?.[1]?.trim() ?? "(not set)";
		const newValue = options["turso-auth-token"];
		changes.push({ description: "Turso auth token updated", key: "authToken", oldValue, newValue, file: "betterbase.config.ts" });
		if (!options.dryRun) {
			configContent = updateConfigValue(configContent, "authToken", newValue);
		}
	}

	let envNewContent: string | undefined;

	if (options.port) {
		const envPath = path.join(projectRoot, ".env");
		if (existsSync(envPath)) {
			const envContent = await readFile(envPath, "utf-8");
			const portRegex = /^PORT=.*/m;
			const portMatch = envContent.match(portRegex);
			const envOldPort = portMatch?.[0] ?? "(PORT not set)";
			changes.push({ description: `Port set to ${options.port}`, key: "PORT", oldValue: envOldPort, newValue: `PORT=${options.port}`, file: ".env" });
			if (!options.dryRun) {
				envNewContent = envContent;
				if (portRegex.test(envNewContent)) {
					envNewContent = envNewContent.replace(portRegex, `PORT=${options.port}`);
				} else {
					envNewContent += `\nPORT=${options.port}\n`;
				}
			}
		}
	}

	if (options["auto-register"]) {
		const oldMatch = configContent.match(/^\t+autoRegister:\s*(.*)$/m);
		const oldValue = oldMatch?.[1]?.trim() ?? "(not set)";
		const newValue = "true";
		changes.push({ description: "Auto-registration enabled", key: "autoRegister", oldValue, newValue, file: "betterbase.config.ts" });
		if (!options.dryRun) {
			configContent = updateConfigValue(configContent, "autoRegister", newValue);
		}
	}

	if (changes.length === 0) {
		if (outputJson) {
			console.log(JSON.stringify([], null, 2));
			return;
		}
		logger.info("No changes specified. Use --provider, --database-url, --port, or --auto-register");
		return;
	}

	if (options.dryRun) {
		if (outputJson) {
			const jsonOutput = changes.map((c) => ({ file: c.file, key: c.key, oldValue: c.oldValue, newValue: c.newValue }));
			console.log(JSON.stringify(jsonOutput, null, 2));
			return;
		}
		console.log(chalk.bold("  Would change:"));
		logger.blank();
		for (const change of changes) {
			console.log(chalk.dim(`    ${change.description}`));
			console.log(chalk.red(`    - ${change.oldValue}`));
			console.log(chalk.green(`    + ${change.newValue}`));
			logger.blank();
		}
		logger.info("No files modified (dry-run mode).");
		return;
	}

	const configChanges = changes.filter((c) => c.file === "betterbase.config.ts");
	const envChanges = changes.filter((c) => c.file === ".env");

	if (configChanges.length > 0) {
		await createBackup(projectRoot, "betterbase.config.ts");
	}

	if (envChanges.length > 0 && envNewContent !== undefined) {
		await createBackup(projectRoot, ".env");
	}

	const timestamp = new Date().toISOString();
	for (const change of changes) {
		await appendConfigLog(projectRoot, { timestamp, action: "update", key: change.key, oldValue: change.oldValue, newValue: change.newValue, file: change.file });
	}

	if (configChanges.length > 0) {
		await writeConfigFile(projectRoot, configContent);
	}

	if (envChanges.length > 0 && envNewContent !== undefined) {
		await writeFile(path.join(projectRoot, ".env"), envNewContent);
	}

	if (!outputJson) {
		const validationErrors = await validatePostChangeConfig(projectRoot);
		if (validationErrors.length > 0) {
			logger.error("Configuration validation failed:");
			validationErrors.forEach((err) => console.log(`  ${logger.sym.error} ${err}`));
			logger.blank();
			logger.warn("You can restore the previous configuration by running: bb configure rollback");
			logger.blank();
			return;
		}
	}

	if (outputJson) {
		const jsonOutput = changes.map((c) => ({ file: c.file, key: c.key, oldValue: c.oldValue, newValue: c.newValue }));
		console.log(JSON.stringify(jsonOutput, null, 2));
		return;
	}

	logger.success("Configuration updated:");
	changes.forEach((change) => console.log(`  ${logger.sym.success} ${change.description}`));
	logger.blank();
	logger.info("Run bb iac sync to apply schema changes.");
}

export async function runRollbackCommand(
	projectRoot: string,
	options: { to?: string; list?: boolean },
): Promise<void> {
	const backupDir = path.join(projectRoot, "betterbase", ".backups");

	if (options.list) {
		const files = await listDir(backupDir);
		const backups = files
			.filter((f) => f.startsWith(BACKUP_PREFIX))
			.sort()
			.reverse();
		if (backups.length === 0) {
			logger.error("No backup files found.");
			process.exit(1);
		}
		logger.success(`Found ${backups.length} backup(s):`);
		for (const backup of backups) {
			const ts = backup.replace(BACKUP_PREFIX, "");
			console.log(`  ${chalk.cyan(ts)}  ${backup}`);
		}
		return;
	}

	let targetBackup: string;
	let backupFile: string;

	if (options.to) {
		const target = `${BACKUP_PREFIX}${options.to}`;
		const files = await listDir(backupDir);
		const match = files.find((f) => f === target);
		if (!match) {
			logger.error(`No backup found with timestamp "${options.to}".`);
			process.exit(1);
		}
		targetBackup = path.join(backupDir, match);
		backupFile = match;
	} else {
		const files = await listDir(backupDir);
		const backups = files
			.filter((f) => f.startsWith(BACKUP_PREFIX))
			.sort()
			.reverse();
		if (backups.length === 0) {
			logger.error("No backup files found. Run bb configure to create a backup first.");
			process.exit(1);
		}
		targetBackup = path.join(backupDir, backups[0]);
		backupFile = backups[0];
	}

	const configPath = path.join(projectRoot, "betterbase.config.ts");
	const backupContent = await readFile(targetBackup, "utf-8");
	await writeFile(configPath, backupContent);

	logger.success(`Rolled back to ${backupFile}`);
	logger.info("Run bb iac sync to apply schema changes if needed.");
}
