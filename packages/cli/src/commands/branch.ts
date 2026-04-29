/**
 * Branch CLI Commands
 *
 * CLI commands for managing preview environments (branches).
 * Provides commands to create, list, delete, sleep, and wake preview environments.
 */

import {
	type BranchConfig,
	type BranchListResult,
	type BranchOperationResult,
	type CreateBranchOptions,
	clearAllBranches,
	createBranchManager,
	getAllBranches,
} from "@betterbase/core/branching";
import { CONFIG_FILE_NAME } from "@betterbase/shared";
import chalk from "chalk";
import * as logger from "../utils/logger";
import { loadConfig } from "../utils/config";

export async function runBranchCreateCommand(
	args: string[],
	projectRoot: string = process.cwd(),
): Promise<void> {
	const name = args[0];

	if (!name) {
		throw new Error("Branch name is required. Usage: bb branch create <name>");
	}

	logger.info(`Creating preview environment: ${chalk.cyan(name)}`);

	const config = await loadConfig(projectRoot);
	if (!config) {
		throw new Error(
			`Could not load configuration from ${CONFIG_FILE_NAME}. Make sure you're in a BetterBase project directory.`,
		);
	}

	const branchManager = createBranchManager(config);

	const options: CreateBranchOptions = {
		name,
		sourceBranch: "main",
		copyDatabase: true,
		copyStorage: true,
	};

	const result = await branchManager.createBranch(options);

	if (!result.success) {
		throw new Error(`Failed to create preview environment: ${result.error}`);
	}

	const branch = result.branch!;
	logger.section("Preview environment created");
	logger.keyValue("Name", branch.name);
	logger.keyValue("Preview URL", branch.previewUrl);
	logger.keyValue("Status", branch.status);

	if (result.warnings && result.warnings.length > 0) {
		logger.warn("Warnings:");
		for (const warning of result.warnings) {
			logger.warn(`  - ${warning}`);
		}
	}

	if (branch.databaseConnectionString) {
		logger.info("Database: Cloned from main");
	}

	if (branch.storageBucket) {
		logger.keyValue("Storage", branch.storageBucket);
	}
}

export async function runBranchListCommand(
	args: string[] = [],
	projectRoot: string = process.cwd(),
): Promise<void> {
	const config = await loadConfig(projectRoot);
	if (!config) {
		throw new Error(
			`Could not load configuration from ${CONFIG_FILE_NAME}. Make sure you're in a BetterBase project directory.`,
		);
	}

	const branchManager = createBranchManager(config);
	const result = branchManager.listBranches();

	if (result.branches.length === 0) {
		logger.info("No preview environments found.");
		logger.info("Run 'bb branch create <name>' to create one.");
		return;
	}

	logger.section(`Preview Environments (${result.total})`);

	for (const branch of result.branches) {
		const statusColor = branch.status === "active" ? chalk.green : branch.status === "sleeping" ? chalk.yellow : chalk.dim;
		console.log(`  ${chalk.bold(branch.name)} ${statusColor(`(${branch.status})`)}`);
		console.log(chalk.dim(`    URL:      ${branch.previewUrl}`));
		console.log(chalk.dim(`    Created:  ${branch.createdAt.toISOString().split("T")[0]}`));
		console.log(chalk.dim(`    Last:     ${branch.lastAccessedAt.toISOString().split("T")[0]}`));
		console.log("");
	}
}

export async function runBranchDeleteCommand(
	args: string[],
	projectRoot: string = process.cwd(),
): Promise<void> {
	const name = args[0];

	if (!name) {
		throw new Error("Branch name is required. Usage: bb branch delete <name>");
	}

	logger.info(`Deleting preview environment: ${chalk.cyan(name)}`);

	const config = await loadConfig(projectRoot);
	if (!config) {
		throw new Error(
			`Could not load configuration from ${CONFIG_FILE_NAME}. Make sure you're in a BetterBase project directory.`,
		);
	}

	const branchManager = createBranchManager(config);
	const branch = branchManager.getBranchByName(name);

	if (!branch) {
		throw new Error(`Preview environment '${name}' not found.`);
	}

	const result = await branchManager.deleteBranch(branch.id);

	if (!result.success) {
		throw new Error(`Failed to delete preview environment: ${result.error}`);
	}

	logger.success(`Preview environment '${chalk.cyan(name)}' deleted.`);

	if (result.warnings && result.warnings.length > 0) {
		logger.warn("Warnings:");
		for (const warning of result.warnings) {
			logger.warn(`  - ${warning}`);
		}
	}
}

export async function runBranchSleepCommand(
	args: string[],
	projectRoot: string = process.cwd(),
): Promise<void> {
	const name = args[0];

	if (!name) {
		throw new Error("Branch name is required. Usage: bb branch sleep <name>");
	}

	logger.info(`Putting preview environment to sleep: ${chalk.cyan(name)}`);

	const config = await loadConfig(projectRoot);
	if (!config) {
		throw new Error(
			`Could not load configuration from ${CONFIG_FILE_NAME}. Make sure you're in a BetterBase project directory.`,
		);
	}

	const branchManager = createBranchManager(config);
	const branch = branchManager.getBranchByName(name);

	if (!branch) {
		throw new Error(`Preview environment '${name}' not found.`);
	}

	const result = await branchManager.sleepBranch(branch.id);

	if (!result.success) {
		throw new Error(`Failed to sleep preview environment: ${result.error}`);
	}

	logger.success(`Preview environment '${chalk.cyan(name)}' is now sleeping.`);
	logger.info("Wake it up later with 'bb branch wake <name>'");
}

export async function runBranchWakeCommand(
	args: string[],
	projectRoot: string = process.cwd(),
): Promise<void> {
	const name = args[0];

	if (!name) {
		throw new Error("Branch name is required. Usage: bb branch wake <name>");
	}

	logger.info(`Waking preview environment: ${chalk.cyan(name)}`);

	const config = await loadConfig(projectRoot);
	if (!config) {
		throw new Error(
			`Could not load configuration from ${CONFIG_FILE_NAME}. Make sure you're in a BetterBase project directory.`,
		);
	}

	const branchManager = createBranchManager(config);
	const branch = branchManager.getBranchByName(name);

	if (!branch) {
		throw new Error(`Preview environment '${name}' not found.`);
	}

	const result = await branchManager.wakeBranch(branch.id);

	if (!result.success) {
		throw new Error(`Failed to wake preview environment: ${result.error}`);
	}

	logger.success(`Preview environment '${chalk.cyan(name)}' is now active!`);
	logger.keyValue("Preview URL", branch.previewUrl);
}

export async function runBranchCommand(
	args: string[] = [],
	projectRoot: string = process.cwd(),
): Promise<void> {
	const action = args[0];

	try {
		switch (action) {
			case "create":
				await runBranchCreateCommand(args.slice(1), projectRoot);
				break;
			case "list":
			case "ls":
				await runBranchListCommand(args.slice(1), projectRoot);
				break;
			case "delete":
			case "remove":
			case "rm":
				await runBranchDeleteCommand(args.slice(1), projectRoot);
				break;
			case "sleep":
				await runBranchSleepCommand(args.slice(1), projectRoot);
				break;
			case "wake":
				await runBranchWakeCommand(args.slice(1), projectRoot);
				break;
			case undefined:
				logger.info("Usage: bb branch <command> [options]");
				logger.blank();
				logger.info("Commands:");
				logger.info("  create <name>   Create a new preview environment");
				logger.info("  list            List all preview environments");
				logger.info("  delete <name>  Delete a preview environment");
				logger.info("  sleep <name>   Put a preview environment to sleep");
				logger.info("  wake <name>    Wake a sleeping preview environment");
				logger.blank();
				logger.info("Examples:");
				logger.info("  bb branch create my-feature");
				logger.info("  bb branch list");
				logger.info("  bb branch delete my-feature");
				break;
			default:
				throw new Error(`Unknown branch command: ${action}`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(message);
		throw error;
	}
}
