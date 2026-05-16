/**
 * Webhook Commands for BetterBase CLI
 *
 * Provides commands for managing webhooks: create, list, test, and view logs.
 */

import { existsSync as fsExistsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type WebhookDeliveryLog, WebhookDispatcher } from "@betterbase/core/webhooks";
import type { DBEventType } from "@betterbase/shared";
import chalk from "chalk";
import inquirer from "inquirer";
import * as logger from "../utils/logger";
import { findConfigFile, loadConfig } from "../utils/config";
import { SchemaScanner } from "../utils/scanner";

interface WebhookEntry {
	id: string;
	table: string;
	events: DBEventType[];
	url: string;
	secret: string;
	enabled: boolean;
}

export function generateWebhookId(): string {
	return `webhook-${Date.now().toString(36)}`;
}

export async function runWebhookCreateCommand(projectRoot: string): Promise<void> {
	const config = await loadConfig(projectRoot);

	if (!config) {
		logger.error("Could not load config. Please ensure betterbase.config.ts exists.");
		return;
	}

	const tables = getTablesFromSchema(projectRoot);

	if (tables.length === 0) {
		logger.error("No tables found in schema. Please define tables in src/db/schema.ts first.");
		return;
	}

	const tableNameResponse = await inquirer.prompt<{ tableName: string }>([
		{
			type: "list",
			name: "tableName",
			message: "Select the table to trigger webhooks:",
			choices: tables,
		},
	]);
	const tableName = tableNameResponse.tableName;

	const eventsResponse = await inquirer.prompt<{ events: string[] }>([
		{
			type: "checkbox",
			name: "events",
			message: "Select events to trigger webhook:",
			choices: [
				{ name: "INSERT", value: "INSERT", checked: true },
				{ name: "UPDATE", value: "UPDATE", checked: true },
				{ name: "DELETE", value: "DELETE", checked: false },
			],
		},
	]);
	const events = eventsResponse.events;

	if (events.length === 0) {
		logger.error("You must select at least one event type.");
		return;
	}

	const urlEnvResponse = await inquirer.prompt<{ urlEnvVar: string }>([
		{
			type: "input",
			name: "urlEnvVar",
			message: "Enter the environment variable name for the webhook URL:",
			default: `WEBHOOK_${tableName.toUpperCase()}_URL`,
			validate: (answer: string) => {
				if (!answer.trim()) {
					return "Environment variable name is required.";
				}
				if (!/^[A-Z][A-Z0-9_]*$/.test(answer)) {
					return "Use uppercase letters and underscores (e.g., WEBHOOK_USERS_URL).";
				}
				return true;
			},
		},
	]);
	const urlEnvVar = urlEnvResponse.urlEnvVar;

	const secretEnvResponse = await inquirer.prompt<{ secretEnvVar: string }>([
		{
			type: "input",
			name: "secretEnvVar",
			message: "Enter the environment variable name for the webhook secret:",
			default: "WEBHOOK_SECRET",
			validate: (answer: string) => {
				if (!answer.trim()) {
					return "Environment variable name is required.";
				}
				if (!/^[A-Z][A-Z0-9_]*$/.test(answer)) {
					return "Use uppercase letters and underscores (e.g., WEBHOOK_SECRET).";
				}
				return true;
			},
		},
	]);
	const secretEnvVar = secretEnvResponse.secretEnvVar;

	const webhookId = generateWebhookId();
	const webhookEntry: WebhookEntry = {
		id: webhookId,
		table: tableName,
		events: events as DBEventType[],
		url: `process.env.${urlEnvVar}`,
		secret: `process.env.${secretEnvVar}`,
		enabled: true,
	};

	const configFile = await readConfigFile(projectRoot);
	if (!configFile) {
		logger.error("Could not read config file.");
		return;
	}

	let { content } = configFile;
	const webhookJson = JSON.stringify(webhookEntry, null, 2);

	if (content.includes("webhooks:")) {
		const webhooksMatch = content.match(/webhooks:\s*\[([^\]]*)\]/s);
		if (webhooksMatch) {
			const existingWebhooks = webhooksMatch[1].trim();
			if (existingWebhooks) {
				content = content.replace(
					/webhooks:\s*\[([^\]]*)\]/s,
					`webhooks: [${existingWebhooks}\n  ${webhookJson.replace(/\n/g, "\n  ")},`,
				);
			} else {
				content = content.replace(/webhooks:\s*\[\s*\]/s, `webhooks: [\n  ${webhookJson}\n]`);
			}
		}
	} else {
		const graphqlMatch = content.match(/graphql:/);
		if (graphqlMatch) {
			content = content.replace(/graphql:/, `webhooks: [\n  ${webhookJson}\n],\n\n  graphql:`);
		} else {
			content = content.replace(/}\s*$/, `,\n  webhooks: [\n    ${webhookJson}\n  ]\n}`);
		}
	}

	if (!writeConfigFile(configFile.path, content)) {
		return;
	}

	logger.success(`Webhook created with ID: ${webhookId}`);

	const envPath = path.join(projectRoot, ".env");
	let envContent = "";
	if (fsExistsSync(envPath)) {
		envContent = readFileSync(envPath, "utf-8");
	}

	const urlKey = `${urlEnvVar}=`;
	const secretKey = `${secretEnvVar}=`;

	if (!envContent.includes(urlKey)) {
		envContent += `\n${urlKey}\n`;
	}
	if (!envContent.includes(secretKey)) {
		envContent += `${secretKey}\n`;
	}

	if (fsExistsSync(envPath)) {
		writeFileSync(envPath, envContent, "utf-8");
	}

	logger.info("\nWebhook created!");
	logger.info("Add your webhook URL to .env:");
	console.log(`  ${urlEnvVar}=https://your-endpoint.com/webhook`);
	console.log(`  ${secretEnvVar}=your-secret-here`);
}

export async function runWebhookListCommand(projectRoot: string): Promise<void> {
	const config = await loadConfig(projectRoot);

	if (!config) {
		return;
	}

	const webhooks = config.webhooks || [];

	if (webhooks.length === 0) {
		logger.info('No webhooks configured. Run "bb webhook create" to add one.');
		return;
	}

	logger.section(`Webhooks (${webhooks.length})`);
	console.log(chalk.dim("─".repeat(80)));
	console.log(
		chalk.bold(`${"ID".padEnd(20)} ${"Table".padEnd(15)} ${"Events".padEnd(20)} ${"Status".padEnd(10)}`),
	);
	console.log(chalk.dim("─".repeat(80)));

	for (const webhook of webhooks) {
		const id = webhook.id.substring(0, 18).padEnd(20);
		const table = webhook.table.padEnd(15);
		const events = webhook.events.join(", ").padEnd(20);
		const status = webhook.enabled ? chalk.green("enabled") : chalk.red("disabled");

		console.log(`${id} ${table} ${events} ${status}`);
	}

	console.log(chalk.dim("─".repeat(80)));
}

export async function runWebhookTestCommand(projectRoot: string, webhookId: string): Promise<void> {
	const config = await loadConfig(projectRoot);

	if (!config) {
		return;
	}

	const webhooks = config.webhooks || [];
	const webhook = webhooks.find((w) => w.id === webhookId);

	if (!webhook) {
		logger.error(`Webhook not found: ${webhookId}`);
		logger.info('Run "bb webhook list" to see available webhooks.');
		return;
	}

	const urlEnvMatch = webhook.url.match(/^process\.env\.(\w+)$/);
	const secretEnvMatch = webhook.secret.match(/^process\.env\.(\w+)$/);

	if (!urlEnvMatch || !secretEnvMatch) {
		logger.error("Webhook URL and secret must be environment variable references.");
		return;
	}

	const urlEnvVar = urlEnvMatch[1];
	const secretEnvVar = secretEnvMatch[1];

	const url = process.env[urlEnvVar];
	const secret = process.env[secretEnvVar];

	if (!url) {
		logger.error(`Environment variable not set: ${urlEnvVar}`);
		logger.info(`Add to .env: ${urlEnvVar}=https://your-endpoint.com/webhook`);
		return;
	}

	if (!secret) {
		logger.error(`Environment variable not set: ${secretEnvVar}`);
		logger.info(`Add to .env: ${secretEnvVar}=your-secret`);
		return;
	}

	const testWebhookConfig = {
		...webhook,
		url,
		secret,
	};

	const dispatcher = new WebhookDispatcher([testWebhookConfig]);

	logger.info(`Testing webhook ${webhookId}...`);
	console.log(`  URL: ${url}`);
	console.log(`  Table: ${webhook.table}`);
	console.log(`  Events: ${webhook.events.join(", ")}\n`);

	try {
		const result = await dispatcher.testWebhook(testWebhookConfig.id);

		if (result.success) {
			logger.success("Webhook test succeeded!");
			console.log(`  Status: ${result.status_code}`);
			if (result.response_body) {
				console.log(chalk.dim(`  Response: ${result.response_body.substring(0, 200)}`));
			}
		} else {
			logger.error("Webhook test failed!");
			if (result.status_code) {
				console.log(`  Status: ${result.status_code}`);
			}
			if (result.response_body) {
				console.log(chalk.dim(`  Response: ${result.response_body.substring(0, 200)}`));
			}
			if (result.error) {
				console.log(chalk.dim(`  Error: ${result.error}`));
			}
		}
	} catch (error) {
		logger.error(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

interface WebhookLogsOptions {
	limit?: number;
}

function findSchemaFile(projectRoot: string): string | null {
	const schemaPaths = [
		path.join(projectRoot, "src/db/schema.ts"),
		path.join(projectRoot, "src/database/schema.ts"),
		path.join(projectRoot, "schema.ts"),
	];

	for (const schemaPath of schemaPaths) {
		if (fsExistsSync(schemaPath)) {
			return schemaPath;
		}
	}

	return null;
}

function getTablesFromSchema(projectRoot: string): string[] {
	const schemaPath = findSchemaFile(projectRoot);
	if (!schemaPath) {
		return [];
	}

	try {
		const scanner = new SchemaScanner(schemaPath);
		const tables = scanner.scan();
		return Object.keys(tables);
	} catch (error) {
		logger.warn(`Failed to scan schema: ${error instanceof Error ? error.message : String(error)}`);
		return [];
	}
}

async function readConfigFile(
	projectRoot: string,
): Promise<{ content: string; path: string } | null> {
	const configPath = await findConfigFile(projectRoot);
	if (!configPath) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		return { content, path: configPath };
	} catch {
		return null;
	}
}

function writeConfigFile(configPath: string, content: string): boolean {
	try {
		writeFileSync(configPath, content, "utf-8");
		return true;
	} catch (error) {
		logger.error(
			`Failed to write config: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}
}

function findDatabasePath(projectRoot: string): string | null {
	const dbPathVariants = [
		path.join(projectRoot, ".betterbase", "dev.db"),
		path.join(projectRoot, "dev.db"),
		path.join(projectRoot, ".data", "dev.db"),
	];

	for (const dbPath of dbPathVariants) {
		if (fsExistsSync(dbPath)) {
			return dbPath;
		}
	}

	return null;
}

export async function runWebhookLogsCommand(
	projectRoot: string,
	webhookId: string,
	options: WebhookLogsOptions = {},
): Promise<void> {
	const config = await loadConfig(projectRoot);

	if (!config) {
		return;
	}

	const webhooks = config.webhooks || [];
	const webhook = webhooks.find((w) => w.id === webhookId);

	if (!webhook) {
		logger.error(`Webhook not found: ${webhookId}`);
		logger.info('Run "bb webhook list" to see available webhooks.');
		return;
	}

	const limit = options.limit ?? 50;

	logger.keyValue("Webhook", webhook.id);
	logger.keyValue("Table", webhook.table);
	logger.keyValue("Events", webhook.events.join(", "));
	logger.keyValue("Limit", String(limit));
	logger.blank();

	logger.section("Delivery Logs");

	const dbPath = findDatabasePath(projectRoot);

	if (!dbPath) {
		logger.info("No local database found.");
		logger.info("Delivery logs are stored in the project's database.");
		console.log(chalk.dim("\n  To view logs, either:"));
		console.log(chalk.dim("  1. Run the dev server and access the API: GET /api/webhooks/:webhookId/deliveries"));
		console.log(chalk.dim("  2. Check the dashboard if deployed\n"));
		return;
	}

	try {
		const { Database } = await import("bun:sqlite");
		const db = new Database(dbPath, { readonly: true });

		interface DeliveryLog {
			id: string;
			webhook_id: string;
			status: string;
			request_url: string;
			response_code: number | null;
			response_body: string | null;
			error: string | null;
			attempt_count: number;
			created_at: string;
			updated_at: string;
		}

		const result: DeliveryLog[] = db
			.query(
				`SELECT
					id,
					webhook_id,
					status,
					request_url,
					response_code,
					response_body,
					error,
					attempt_count,
					created_at,
					updated_at
				FROM _betterbase_webhook_deliveries
				WHERE webhook_id = ?
				ORDER BY created_at DESC
				LIMIT ?`,
			)
			.all(webhookId, limit) as DeliveryLog[];

		db.close();

		if (result.length === 0) {
			logger.info("No delivery logs found for this webhook.");
			return;
		}

		console.log(chalk.bold(`${"Status".padEnd(10)} ${"Code".padEnd(6)} ${"Attempts".padEnd(10)} ${"Created At".padEnd(24)} ${"Error".padEnd(20)}`));
		console.log(chalk.dim("─".repeat(80)));

		for (const log of result) {
			const status = log.status.padEnd(10);
			const code = (log.response_code?.toString() ?? "N/A").padEnd(6);
			const attempts = log.attempt_count.toString().padEnd(10);
			const createdAt = log.created_at
				? new Date(log.created_at).toISOString().replace("T", " ").substring(0, 19)
				: "N/A";
			const error = log.error ? log.error.substring(0, 20) : "";

			const statusColored =
				log.status === "success"
					? chalk.green(status)
					: log.status === "failed"
						? chalk.red(status)
						: chalk.yellow(status);

			console.log(`${statusColored} ${code} ${attempts} ${createdAt} ${error}`);
		}

		console.log(chalk.dim("─".repeat(80)));
		console.log(`\nTotal: ${result.length} delivery log(s)\n`);
	} catch (error) {
		logger.warn("Could not fetch delivery logs from database.");
		if (error instanceof Error) {
			logger.warn(error.message);
		}
		console.log(chalk.dim("\n  Make sure migrations have been run."));
		console.log(chalk.dim("  Run: bb migrate\n"));
	}
}

export async function runWebhookCommand(args: string[], projectRoot: string): Promise<void> {
	const [subcommand, ...remainingArgs] = args;

	switch (subcommand) {
		case "create":
			await runWebhookCreateCommand(projectRoot);
			break;

		case "list":
			await runWebhookListCommand(projectRoot);
			break;

		case "test":
			if (remainingArgs.length === 0) {
				logger.error("Usage: bb webhook test <webhook-id>");
				logger.info('Run "bb webhook list" to see available webhooks.');
				return;
			}
			await runWebhookTestCommand(projectRoot, remainingArgs[0]);
			break;

		case "logs":
			if (remainingArgs.length === 0) {
				logger.error("Usage: bb webhook logs <webhook-id> [-l, --limit <number>]");
				logger.info('Run "bb webhook list" to see available webhooks.');
				return;
			}
			const limit = remainingArgs[1] ? parseInt(remainingArgs[1], 10) : undefined;
			await runWebhookLogsCommand(projectRoot, remainingArgs[0], { limit });
			break;

		default:
			logger.section("BetterBase Webhook Commands");
			logger.info("Usage:");
			console.log(chalk.dim("  bb webhook <command> [options]"));
			logger.blank();
			logger.info("Commands:");
			console.log(chalk.dim(`  ${chalk.white("create")}           Create a new webhook`));
			console.log(chalk.dim(`  ${chalk.white("list")}             List all configured webhooks`));
			console.log(chalk.dim(`  ${chalk.white("test <id>")}        Test a webhook by sending a synthetic payload`));
			console.log(chalk.dim(`  ${chalk.white("logs <id>")}        Show delivery logs for a webhook`));
			logger.blank();
			logger.info("Examples:");
			console.log(chalk.dim("  bb webhook create"));
			console.log(chalk.dim("  bb webhook list"));
			console.log(chalk.dim("  bb webhook test webhook-abc123"));
			console.log(chalk.dim("  bb webhook logs webhook-abc123"));
			break;
	}
}
