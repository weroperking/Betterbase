import chalk from "chalk";
import { Command, CommanderError } from "commander";
import packageJson from "../package.json";
import { runAuthAddProviderCommand, runAuthSetupCommand } from "./commands/auth";
import { runBranchCommand } from "./commands/branch";
import { runDevCommand } from "./commands/dev";
import { runFunctionCommand } from "./commands/function";
import { runGenerateCrudCommand } from "./commands/generate";
import { runGenerateGraphqlCommand, runGraphqlPlaygroundCommand } from "./commands/graphql";
import { runIacAnalyze } from "./commands/iac/analyze";
import { runIacExport } from "./commands/iac/export";
import { runMigrateLegacyToIaC } from "./commands/iac/migrate-legacy";
import { runIacGenerate } from "./commands/iac/generate";
import { runIacImport } from "./commands/iac/import";
import { runIacSync } from "./commands/iac/sync";
import { runInitCommand } from "./commands/init";
import { isAuthenticated, runLoginCommand, runLogoutCommand } from "./commands/login";
import { runValidateProject } from "./commands/validate";
import {
	runMigrateCommand,
	runMigrateHistoryCommand,
	runMigrateRollbackCommand,
} from "./commands/migrate";
import { runMigrateFromConvex } from "./commands/migrate/from-convex";
import { runRlsCommand } from "./commands/rls";
import { runRLSTestCommand } from "./commands/rls-test";
import {
	runStorageBucketsListCommand,
	runStorageInitCommand,
	runStorageUploadCommand,
} from "./commands/storage";
import { runWebhookCommand } from "./commands/webhook";
import {
	runPipelineGenerate,
	runPipelineValidate,
	runPipelineRun,
	runPipelineStatus,
	type PipelineOptions,
} from "./commands/pipeline";
import {
	runInfraInit,
	runInfraValidate,
	runInfraPlan,
	runInfraApply,
	runInfraDestroy,
	type InfraOptions,
} from "./commands/infra";
import { runDeployCommand, type DeployOptions } from "./commands/deploy";
import {
	runMonitorLogs,
	runMonitorMetrics,
	runMonitorAlerts,
	runMonitorStatus,
	type MonitorOptions,
} from "./commands/monitor";
import {
	runScaleStatus,
	runScaleConfig,
	runScaleEvents,
	runScaleNow,
	type ScaleOptions,
} from "./commands/scale";
import {
	runPatchCheck,
	runPatchApply,
	runPatchSchedule,
	runPatchRollback,
	type PatchOptions,
} from "./commands/patch";
import {
	runMaintainBackup,
	runMaintainRestore,
	runMaintainCleanup,
	runMaintainOptimize,
	runMaintainMigrate,
	type MaintainOptions,
} from "./commands/maintain";
import * as logger from "./utils/logger";

// Commands that don't require authentication
const PUBLIC_COMMANDS = [
	"login",
	"logout",
	"version",
	"help",
	"init",
	"pipeline",
	"infra",
	"deploy",
	"monitor",
	"scale",
	"patch",
	"maintain",
	"--version",
	"-V",
	"--help",
	"-h",
];

function extractCommandName(argv: string[]): string {
	for (let i = 2; i < argv.length; i++) {
		const arg = argv[i];
		if (arg && !arg.startsWith("-")) {
			return arg;
		}
	}
	return "";
}

/**
 * Check if the user is authenticated before running a command.
 */
async function checkAuthHook(): Promise<void> {
	const commandName = extractCommandName(process.argv);

	if (!commandName || PUBLIC_COMMANDS.includes(commandName)) {
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		logger.error(
			"Not logged in. Run: bb login\n" +
				"This connects your CLI with BetterBase so your project\n" +
				"can be registered and managed from the dashboard.",
		);
		process.exit(1);
	}
}

/**
 * Create and configure the BetterBase CLI program.
 */
export function createProgram(): Command {
	const program = new Command();
	const isDebug = process.argv.includes("--debug");

	program
		.name("bb")
		.description("BetterBase CLI")
		.version(packageJson.version, "-v, --version", "display the CLI version")
		.option("--debug", "Show full error stack traces")
		.exitOverride()
		.hook("preAction", checkAuthHook);

	program.configureOutput({
		writeErr: (str) => {
			logger.error(str.replace(/^error: /i, "").trim());
		},
	});
	program.configureHelp({
		sortSubcommands: true,
		helpWidth: 80,
		subcommandTerm: (cmd) => chalk.cyan(cmd.name()),
		optionTerm: (opt) => chalk.yellow(opt.flags),
	});
	program.addHelpText(
		"before",
		`\n${chalk.bold("  bb")} ${chalk.dim("— Betterbase CLI")}\n\n  ${chalk.dim("Manage projects, schema, functions, and deployments.")}\n`,
	);
	program.addHelpText(
		"after",
		`\n  ${chalk.dim("Examples:")}\n    ${chalk.dim("$")} bb init my-app\n    ${chalk.dim("$")} bb dev\n    ${chalk.dim("$")} bb iac sync\n    ${chalk.dim("$")} bb login --url http://localhost:3001\n\n  ${chalk.dim("Docs:")} ${chalk.cyan("https://docs.betterbase.io/cli")}\n`,
	);

	const getErrorHint = (err: unknown): string | undefined => {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes("ENOENT"))
			return "File not found — check that you're in a Betterbase project directory";
		if (msg.includes("ECONNREFUSED")) return "Could not reach server — is it running?";
		if (msg.includes("Unauthorized")) return "Run `bb login` to authenticate";
		if (msg.includes("MODULE_NOT_FOUND")) return "Run `bun install` to install dependencies";
		if (msg.includes("DATABASE_URL")) return "Set DATABASE_URL in your .env file";
		return undefined;
	};
	process.on("uncaughtException", (err) => {
		logger.blank();
		logger.error(err.message, getErrorHint(err));
		if (isDebug) console.error(chalk.dim(err.stack));
		logger.blank();
		process.exit(1);
	});
	process.on("unhandledRejection", (reason: unknown) => {
		const err = reason instanceof Error ? reason : new Error(String(reason));
		logger.blank();
		logger.error(err.message, getErrorHint(err));
		if (isDebug) console.error(chalk.dim(err.stack));
		logger.blank();
		process.exit(1);
	});

program
	.command("init")
	.description("Initialize a BetterBase project with BetterBase IaC template")
	.argument("[project-name]", "project name")
	.action(async (projectName: string | undefined) => {
		await runInitCommand({ projectName });
	});

	program
	.command("validate-project")
	.description("Validate project for IaC compliance")
	.argument("[project-root]", "project root directory", process.cwd())
	.action(async (projectRoot: string) => {
		await runValidateProject(projectRoot);
	});

	program
		.command("dev")
		.description("Watch schema/routes and regenerate .betterbase-context.json")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (projectRoot: string) => {
			const cleanup = await runDevCommand(projectRoot);

			let cleanedUp = false;
			const onExit = (): void => {
				if (!cleanedUp) {
					cleanedUp = true;
					try {
						cleanup();
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						logger.warn(`Dev cleanup failed: ${message}`);
					}
				}

				process.off("SIGINT", onSigInt);
				process.off("SIGTERM", onSigTerm);
				process.off("exit", onProcessExit);
			};
			const onSigInt = (): void => {
				onExit();
				process.exit(0);
			};
			const onSigTerm = (): void => {
				onExit();
				process.exit(0);
			};
			const onProcessExit = (): void => {
				onExit();
			};

			process.on("SIGINT", onSigInt);
			process.on("SIGTERM", onSigTerm);
			process.on("exit", onProcessExit);
		});

	const auth = program.command("auth").description("Authentication helpers");

	auth
		.command("setup")
		.description("Install and scaffold BetterAuth integration")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (projectRoot: string) => {
			await runAuthSetupCommand(projectRoot);
		});

	auth
		.command("add-provider")
		.description(
			"Add OAuth provider (google, github, discord, apple, microsoft, twitter, facebook)",
		)
		.argument("<provider>", "OAuth provider name")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (provider: string, projectRoot: string) => {
			await runAuthAddProviderCommand(projectRoot, provider);
		});

	const generate = program.command("generate").description("Code generation helpers");

	generate
		.command("crud")
		.description("Generate full CRUD routes for a table")
		.argument("<table-name>", "table name from src/db/schema.ts")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (tableName: string, projectRoot: string) => {
			await runGenerateCrudCommand(projectRoot, tableName);
		});

	const graphql = program.command("graphql").description("GraphQL API management");

	graphql
		.command("generate")
		.description("Generate GraphQL schema from database schema")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (projectRoot: string) => {
			await runGenerateGraphqlCommand(projectRoot);
		});

	graphql
		.command("playground")
		.description("Open GraphQL Playground in browser")
		.action(async () => {
			await runGraphqlPlaygroundCommand();
		});

	const iac = program.command("iac").description("IaC (Infrastructure as Code) management");

iac
	.command("sync")
	.description("Sync IaC schema changes and generate Drizzle migration")
	.argument("[project-root]", "project root directory", process.cwd())
	.option("--force", "Apply destructive changes without confirmation")
	.option("--headless", "Non-interactive mode for AI agents")
	.option("--autoRegister", "Automatically register project with server")
	.option("--environment <env>", "Target environment (local, staging, production)")
	.action(async (projectRoot: string, options: { force?: boolean; headless?: boolean; autoRegister?: boolean; environment?: string }) => {
		await runIacSync(projectRoot, { 
			force: options.force, 
			headless: options.headless,
			autoRegister: options.autoRegister,
			environment: options.environment
		});
	});

	iac
		.command("generate")
		.description("Generate API type definitions from betterbase/ functions")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (projectRoot: string) => {
			await runIacGenerate(projectRoot);
		});

	iac
		.command("analyze")
		.description("Run query diagnostics and analyze for performance issues")
		.argument("[project-root]", "project root directory", process.cwd())
		.option("-o, --output <format>", "Output format: json or table", "table")
		.action(async (projectRoot: string, options: { output?: string }) => {
			const output = options.output === "json" ? "json" : "table";
			await runIacAnalyze(projectRoot, { output });
		});

	iac
		.command("export")
		.description("Export data from the project database")
		.argument("[project-root]", "project root directory", process.cwd())
		.option("-f, --format <format>", "Export format: json or sql", "json")
		.option("-o, --output <path>", "Output directory", "./backup")
		.option("-t, --table <name>", "Table name to export")
		.action(
			async (
				projectRoot: string,
				options: { format?: string; output?: string; table?: string },
			) => {
				await runIacExport(projectRoot, {
					format: options.format as "json" | "sql",
					output: options.output ?? "./backup",
					table: options.table,
				});
			},
		);

	iac
		.command("import")
		.description("Import data into the project database")
		.argument("<input>", "Input file path to import")
		.option("-t, --table <name>", "Table name to import into")
		.option("-d, --dry-run", "Preview changes without applying them")
		.action(async (input: string, options: { table?: string; dryRun?: boolean }) => {
			await runIacImport(process.cwd(), {
				input,
				table: options.table,
				dryRun: options.dryRun,
			});
		});

	iac
		.command("migrate-legacy")
		.description("Migrate a legacy BetterBase project to IaC mode")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (projectRoot: string) => {
			await runMigrateLegacyToIaC(projectRoot);
		});

	const migrate = program
		.command("migrate")
		.description("Generate and apply migrations for local development");

	migrate.action(async () => {
		await runMigrateCommand({ projectRoot: process.cwd() });
	});

	migrate
		.command("preview")
		.description("Preview migration diff without applying changes")
		.action(async () => {
			await runMigrateCommand({ preview: true, projectRoot: process.cwd() });
		});

	migrate
		.command("production")
		.description("Apply migrations to production (requires confirmation)")
		.action(async () => {
			await runMigrateCommand({ production: true, projectRoot: process.cwd() });
		});

	migrate
		.command("rollback")
		.description("Rollback the last migration")
		.option("-s, --steps <number>", "Number of migrations to rollback", "1")
		.action(async (options: { steps?: string }) => {
			await runMigrateRollbackCommand(process.cwd(), {
				steps: options.steps ? Number.parseInt(options.steps, 10) : 1,
			});
		});

	migrate
		.command("history")
		.description("Show migration history")
		.action(async () => {
			await runMigrateHistoryCommand(process.cwd());
		});

	migrate
		.command("from-convex")
		.description("Migrate a Convex project to BetterBase")
		.argument("<input-path>", "Path to the Convex project directory")
		.option("-o, --output <path>", "Output directory for migrated project", "./migrated")
		.action(async (inputPath: string, options: { output?: string }) => {
			await runMigrateFromConvex({
				inputPath,
				outputPath: options.output ?? "./migrated",
			});
		});

	const storage = program.command("storage").description("Storage management");

	storage
		.command("init")
		.description("Initialize storage with a provider")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (projectRoot: string) => {
			await runStorageInitCommand(projectRoot);
		});

	storage
		.command("list")
		.description("List objects in storage bucket")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (projectRoot: string) => {
			await runStorageBucketsListCommand(projectRoot);
		});

	storage
		.command("buckets")
		.description("List objects in storage bucket (alias for list)")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (projectRoot: string) => {
			await runStorageBucketsListCommand(projectRoot);
		});

	storage
		.command("upload")
		.description("Upload a file to storage")
		.argument("<file>", "file path to upload")
		.option("-b, --bucket <name>", "bucket name")
		.option("-p, --path <path>", "remote path")
		.option("-r, --root <path>", "project root directory", process.cwd())
		.action(async (file: string, options: { bucket?: string; path?: string; root?: string }) => {
			await runStorageUploadCommand(file, {
				bucket: options.bucket,
				path: options.path,
				projectRoot: options.root,
			});
		});

	const rls = program.command("rls").description("Row Level Security policy management");

	rls
		.command("create")
		.description("Create a new RLS policy file for a table")
		.argument("<table>", "table name")
		.action(async (table: string) => {
			await runRlsCommand(["create", table]);
		});

	rls
		.command("list")
		.description("List all RLS policy files")
		.action(async () => {
			await runRlsCommand(["list"]);
		});

	rls
		.command("disable")
		.description("Show how to disable RLS for a table")
		.argument("<table>", "table name")
		.action(async (table: string) => {
			await runRlsCommand(["disable", table]);
		});

	rls
		.command("test")
		.description("Test RLS policies for a table")
		.argument("<table>", "table name to test")
		.action(async (table: string) => {
			await runRLSTestCommand(process.cwd(), table);
		});

	rls.action(async () => {
		await runRlsCommand([]);
	});

	const webhook = program.command("webhook").description("Webhook management");

	webhook
		.command("create")
		.description("Create a new webhook")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (projectRoot: string) => {
			await runWebhookCommand(["create"], projectRoot);
		});

	webhook
		.command("list")
		.description("List all configured webhooks")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (projectRoot: string) => {
			await runWebhookCommand(["list"], projectRoot);
		});

	webhook
		.command("test")
		.description("Test a webhook by sending a synthetic payload")
		.argument("<webhook-id>", "webhook ID to test")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (webhookId: string, projectRoot: string) => {
			await runWebhookCommand(["test", webhookId], projectRoot);
		});

	webhook
		.command("logs")
		.description("Show delivery logs for a webhook")
		.argument("<webhook-id>", "webhook ID")
		.option("-l, --limit <number>", "Limit number of logs to show", "50")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (webhookId: string, options: { limit?: string }, projectRoot: string) => {
			const limit = options.limit ? Number.parseInt(options.limit, 10) : 50;
			await runWebhookCommand(["logs", webhookId, limit.toString()], projectRoot);
		});

	webhook.action(async () => {
		await runWebhookCommand([], process.cwd());
	});

	const fn = program.command("function").description("Edge function management");

	fn.command("create")
		.description("Create a new edge function")
		.argument("<name>", "function name")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (name: string, projectRoot: string) => {
			await runFunctionCommand(["create", name], projectRoot);
		});

	fn.command("dev")
		.description("Run function locally with hot reload")
		.argument("<name>", "function name")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (name: string, projectRoot: string) => {
			await runFunctionCommand(["dev", name], projectRoot);
		});

	fn.command("build")
		.description("Bundle function for deployment")
		.argument("<name>", "function name")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (name: string, projectRoot: string) => {
			await runFunctionCommand(["build", name], projectRoot);
		});

	fn.command("list")
		.description("List all functions")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (projectRoot: string) => {
			await runFunctionCommand(["list"], projectRoot);
		});

	fn.command("logs")
		.description("Show function logs")
		.argument("<name>", "function name")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (name: string, projectRoot: string) => {
			await runFunctionCommand(["logs", name], projectRoot);
		});

	fn.command("deploy")
		.description("Deploy function to cloud")
		.argument("<name>", "function name")
		.option("--sync-env", "Sync environment variables from .env")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (name: string, projectRootArg: string, options: { syncEnv?: boolean }) => {
			const args = ["deploy", name];
			if (options.syncEnv) args.push("--sync-env");
			await runFunctionCommand(args, projectRootArg);
		});

	// ── bb login — STAGED FOR ACTIVATION ────────────────────────────────────────
	// This code is complete and tested. Uncomment when app.betterbase.com is live.
	// See: betterbase_backend_rebuild.md Part 3
	// ────────────────────────────────────────────────────────────────────────────
	const branch = program.command("branch").description("Preview environment (branch) management");

	branch
		.command("create")
		.description("Create a new preview environment")
		.argument("<name>", "name for the preview environment")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (name: string, projectRoot: string) => {
			await runBranchCommand(["create", name], projectRoot);
		});

	branch
		.command("list")
		.description("List all preview environments")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (projectRoot: string) => {
			await runBranchCommand(["list"], projectRoot);
		});

	branch
		.command("delete")
		.description("Delete a preview environment")
		.argument("<name>", "name of the preview environment to delete")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (name: string, projectRoot: string) => {
			await runBranchCommand(["delete", name], projectRoot);
		});

	branch
		.command("sleep")
		.description("Put a preview environment to sleep")
		.argument("<name>", "name of the preview environment to sleep")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (name: string, projectRoot: string) => {
			await runBranchCommand(["sleep", name], projectRoot);
		});

	branch
		.command("wake")
		.description("Wake a sleeping preview environment")
		.argument("<name>", "name of the preview environment to wake")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (name: string, projectRoot: string) => {
			await runBranchCommand(["wake", name], projectRoot);
		});

	branch
		.command("status")
		.description("Get status of a preview environment")
		.argument("<name>", "name of the preview environment")
		.argument("[project-root]", "project root directory", process.cwd())
		.action(async (name: string, projectRoot: string) => {
			await runBranchCommand(["status", name], projectRoot);
		});

	branch
		.option("-p, --project-root <path>", "project root directory", process.cwd())
		.action(async (options: { projectRoot?: string }) => {
			const projectRoot = options.projectRoot || process.cwd();
			await runBranchCommand([], projectRoot);
		});

	// ── Stage 3: CI/CD & Deployment ─────────────────────────────────────────────
	const pipeline = program.command("pipeline").description("CI/CD pipeline management");

	pipeline
		.command("generate")
		.description("Generate a CI/CD pipeline config")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.option("--dry-run", "preview without writing")
		.option("--force", "overwrite existing pipeline file")
		.action(async (options: PipelineOptions) => {
			await runPipelineGenerate(options);
		});

	pipeline
		.command("validate")
		.description("Validate the pipeline config for required steps")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.action(async (options: PipelineOptions) => {
			await runPipelineValidate(options);
		});

	pipeline
		.command("run")
		.description("Run the pipeline steps locally")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--local", "run steps locally")
		.option("--json", "structured JSON output")
		.option("--dry-run", "preview steps without running")
		.action(async (options: PipelineOptions) => {
			await runPipelineRun(options);
		});

	pipeline
		.command("status")
		.description("Show the last local pipeline run status")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.action(async (options: PipelineOptions) => {
			await runPipelineStatus(options);
		});

	const infra = program.command("infra").description("Infrastructure-as-Code management");

	infra
		.command("init")
		.description("Scaffold a default infrastructure config")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.option("--dry-run", "preview without writing")
		.option("--force", "overwrite existing config")
		.action(async (options: InfraOptions) => {
			await runInfraInit(options);
		});

	infra
		.command("validate")
		.description("Validate the infrastructure config schema")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.action(async (options: InfraOptions) => {
			await runInfraValidate(options);
		});

	infra
		.command("plan")
		.description("Preview infrastructure changes")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.action(async (options: InfraOptions) => {
			await runInfraPlan(options);
		});

	infra
		.command("apply")
		.description("Apply infrastructure changes")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.option("--dry-run", "preview without applying")
		.option("--force", "skip confirmation")
		.option("--auto-approve", "apply without confirmation")
		.action(async (options: InfraOptions & { autoApprove?: boolean }) => {
			await runInfraApply(options);
		});

	infra
		.command("destroy")
		.description("Destroy tracked infrastructure state")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.option("--dry-run", "preview without destroying")
		.option("--force", "skip confirmation")
		.action(async (options: InfraOptions) => {
			await runInfraDestroy(options);
		});

	const deploy = program.command("deploy").description("Deployment orchestration");

	const deployOpts = (cmd: Command): Command =>
		cmd
			.option("--project <path>", "target project directory", process.cwd())
			.option("--env <env>", "target environment", "production")
			.option("--strategy <strategy>", "blue-green | canary | rolling", "blue-green")
			.option("--no-build", "skip the build step")
			.option("--json", "structured JSON output")
			.option("--dry-run", "preview without deploying")
			.option("--force", "skip confirmation");

	deployOpts(deploy).action(async (options: DeployOptions) => {
		await runDeployCommand("deploy", options);
	});

	deployOpts(deploy.command("canary").description("Deploy a canary release")).action(
		async (options: DeployOptions) => {
			await runDeployCommand("canary", options);
		},
	);

	deployOpts(deploy.command("preview").description("Create a preview deployment")).action(
		async (options: DeployOptions) => {
			await runDeployCommand("preview", options);
		},
	);

	deployOpts(deploy.command("rollback").description("Roll back to the previous deployment")).action(
		async (options: DeployOptions) => {
			await runDeployCommand("rollback", options);
		},
	);

	// ── Stage 4: Post-Production & Operations ────────────────────────────────────
	const monitor = program.command("monitor").description("Monitoring & observability");

	monitor
		.command("logs")
		.description("Read local application logs")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--since <duration>", "only show logs since (e.g. 1h, 30m, 7d)")
		.option("--limit <n>", "max lines to show", "200")
		.option("--json", "structured JSON output")
		.action(async (options: MonitorOptions) => {
			await runMonitorLogs(options);
		});

	monitor
		.command("metrics")
		.description("View aggregated metrics")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--since <duration>", "period (e.g. 1h, 24h)")
		.option("--json", "structured JSON output")
		.action(async (options: MonitorOptions) => {
			await runMonitorMetrics(options);
		});

	monitor
		.command("alerts")
		.description("List, add, or remove alert rules")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--add <rule>", 'add rule, e.g. "high-cpu:cpu > 80"')
		.option("--remove <id>", "remove rule by id or name")
		.option("--json", "structured JSON output")
		.action(async (options: MonitorOptions & { add?: string; remove?: string }) => {
			await runMonitorAlerts(options);
		});

	monitor
		.command("status")
		.description("Overall project status")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.action(async (options: MonitorOptions) => {
			await runMonitorStatus(options);
		});

	const scale = program.command("scale").description("Auto-scaling management");

	scale
		.command("status")
		.description("Show current scaling status")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.action(async (options: ScaleOptions) => {
			await runScaleStatus(options);
		});

	scale
		.command("config")
		.description("Get or set scaling config (e.g. --set cpu=60,min=2,max=5)")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--set <pairs>", "comma-separated key=value pairs")
		.option("--json", "structured JSON output")
		.action(async (options: ScaleOptions) => {
			await runScaleConfig(options);
		});

	scale
		.command("events")
		.description("List scaling events")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.action(async (options: ScaleOptions) => {
			await runScaleEvents(options);
		});

	scale
		.command("now")
		.description("Trigger a manual scale (--replicas <n>)")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--replicas <n>", "target replica count")
		.option("--json", "structured JSON output")
		.action(async (options: ScaleOptions) => {
			await runScaleNow(options);
		});

	const patch = program.command("patch").description("Security patching");

	patch
		.command("check")
		.description("Check for dependency vulnerabilities")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.option("--dry-run", "preview without running audit")
		.action(async (options: PatchOptions) => {
			await runPatchCheck(options);
		});

	patch
		.command("apply")
		.description("Apply security patches")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--auto", "auto-apply safe patches")
		.option("--force", "apply without confirmation")
		.option("--json", "structured JSON output")
		.option("--dry-run", "preview without applying")
		.action(async (options: PatchOptions) => {
			await runPatchApply(options);
		});

	patch
		.command("schedule")
		.description("Schedule automatic patching")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--schedule <frequency>", "daily | weekly | monthly", "weekly")
		.option("--auto", "auto-apply safe patches on schedule")
		.option("--json", "structured JSON output")
		.action(async (options: PatchOptions) => {
			await runPatchSchedule(options);
		});

	patch
		.command("rollback")
		.description("Restore backed-up manifests")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.option("--dry-run", "preview without restoring")
		.action(async (options: PatchOptions) => {
			await runPatchRollback(options);
		});

	const maintain = program.command("maintain").description("Maintenance workflows");

	maintain
		.command("backup")
		.description("Create a database backup")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.option("--dry-run", "preview without backing up")
		.action(async (options: MaintainOptions) => {
			await runMaintainBackup(options);
		});

	maintain
		.command("restore")
		.description("Restore from a backup")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--file <path>", "backup file to restore (defaults to latest)")
		.option("--json", "structured JSON output")
		.option("--dry-run", "preview without restoring")
		.option("--force", "skip confirmation")
		.action(async (options: MaintainOptions) => {
			await runMaintainRestore(options);
		});

	maintain
		.command("cleanup")
		.description("Remove old logs and backups")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--keep <n>", "number of newest files to keep per type", "5")
		.option("--json", "structured JSON output")
		.option("--dry-run", "preview without deleting")
		.action(async (options: MaintainOptions) => {
			await runMaintainCleanup(options);
		});

	maintain
		.command("optimize")
		.description("Optimize the database (VACUUM/ANALYZE)")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.option("--dry-run", "preview without running")
		.action(async (options: MaintainOptions) => {
			await runMaintainOptimize(options);
		});

	maintain
		.command("migrate")
		.description("Run database migrations")
		.option("--project <path>", "target project directory", process.cwd())
		.option("--json", "structured JSON output")
		.option("--dry-run", "preview migration diff only")
		.action(async (options: MaintainOptions) => {
			await runMaintainMigrate(options);
		});

program
	.command("login")
	.description("Authenticate with a Betterbase instance")
	.option("--url <url>", "Self-hosted Betterbase server URL", "https://api.betterbase.io")
	.option("--email <email>", "Admin email (for headless/server login)")
	.option("--headless", "Non-interactive mode for AI agents")
	.option("--api-key <key>", "API key for headless authentication")
	.action(async (opts) => {
		if (opts.headless) {
			if (!opts.apiKey) {
				logger.error("Missing --api-key: --api-key is required when using --headless");
				process.exit(1);
			}
			const { runHeadlessLogin } = await import("./commands/login");
			await runHeadlessLogin({ 
				apiKey: opts.apiKey, 
				serverUrl: opts.url 
			});
		} else if (opts.email) {
			const { runApiKeyLogin } = await import("./commands/login");
			let password = process.env.ADMIN_PASSWORD;
			if (!password) {
				const { default: inquirer } = await import("inquirer");
				const result = await inquirer.prompt<{ password: string }>([
					{
						type: "password",
						name: "password",
						message: "Admin password:",
						mask: "*",
						validate: (value: string) => value.length >= 1 || "Password is required",
					},
				]);
				password = result.password;
			}
			await runApiKeyLogin({ serverUrl: opts.url, email: opts.email, password: password ?? "" });
		} else {
			await runLoginCommand({ serverUrl: opts.url });
		}
	});

	program.command("logout").description("Sign out of Betterbase").action(runLogoutCommand);

	return program;
}

/**
 * Execute the CLI with process arguments.
 */
export async function runCli(argv: string[] = process.argv): Promise<void> {
	const program = createProgram();

	try {
		await program.parseAsync(argv);
	} catch (err) {
		if (
			err instanceof CommanderError &&
			(err.code === "commander.helpDisplayed" || err.code === "commander.version")
		) {
			return;
		}

		throw err;
	}
}

if (import.meta.main) {
	try {
		await runCli();
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown CLI error";
		logger.error(message);
		process.exitCode = 1;
	}
}
