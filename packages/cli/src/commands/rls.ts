/**
 * RLS CLI Commands
 *
 * CLI commands for managing Row Level Security policies:
 * - bb rls create <table> - Scaffold a new policy file
 * - bb rls list - List all policy files
 * - bb rls disable <table> - Drop RLS policies from a table
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import * as logger from "../utils/logger";

const POLICIES_DIR = "src/db/policies";
const POLICY_FILE_PATTERN = /\.policy\.ts$/;

/**
 * Ensure the policies directory exists
 */
function ensurePoliciesDir(projectRoot: string): string {
	const policiesPath = path.join(projectRoot, POLICIES_DIR);

	if (!existsSync(policiesPath)) {
		mkdirSync(policiesPath, { recursive: true });
	}

	return policiesPath;
}

/**
 * Find all policy files in the project
 */
function findPolicyFiles(projectRoot: string): string[] {
	const policiesPath = path.join(projectRoot, POLICIES_DIR);
	const files: string[] = [];

	if (!existsSync(policiesPath)) {
		return files;
	}

	const entries = readdirSync(policiesPath, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isFile() && POLICY_FILE_PATTERN.test(entry.name)) {
			files.push(entry.name);
		}
	}

	return files;
}

/**
 * Generate a policy template file
 * @param table - Table name
 * @returns Template content
 */
function generatePolicyTemplate(table: string): string {
	return `import { definePolicy } from '@betterbase/core/rls'

/**
 * RLS policy for ${table} table
 *
 * This policy controls access to the ${table} table.
 * Update the conditions below to match your security requirements.
 *
 * Common patterns:
 * - "auth.uid() = user_id" - Only owner can access
 * - "auth.uid() = created_by" - Only creator can access
 * - "true" - Public access (everyone can access)
 */
export default definePolicy('${table}', {
  // SELECT - Controls who can read rows
  select: "auth.uid() = user_id",

  // INSERT - Controls who can create rows
  // use withCheck to validate the values being inserted
  insert: "auth.uid() = user_id",

  // UPDATE - Controls who can modify rows
  // using: condition for SELECT/UPDATE/DELETE
  // withCheck: condition for INSERT/UPDATE
  update: "auth.uid() = user_id",

  // DELETE - Controls who can delete rows
  delete: "auth.uid() = user_id",
})
`;
}

/**
 * Run the rls create command
 * @param table - Table name to create policy for
 */
export async function runRlsCreate(table: string): Promise<void> {
	if (!table) {
		throw new Error("Table name is required. Usage: bb rls create <table>");
	}

	const sanitizedTable = table.replace(/[^a-zA-Z0-9_]/g, "_");

	const projectRoot = process.cwd();
	const policiesDir = ensurePoliciesDir(projectRoot);
	const fileName = `${sanitizedTable}.policy.ts`;
	const filePath = path.join(policiesDir, fileName);

	if (existsSync(filePath)) {
		logger.warn(`Policy file already exists: ${filePath}`);
		logger.info("Use bb rls disable first to remove existing policies.");
		return;
	}

	const template = generatePolicyTemplate(sanitizedTable);
	writeFileSync(filePath, template);

	logger.success(`Created policy file: ${filePath}`);
	console.log(chalk.gray("\nEdit this file to configure your RLS policy."));
	console.log(chalk.gray("Then run: bb migrate\n"));
}

/**
 * Run the rls list command
 */
export async function runRlsList(): Promise<void> {
	const projectRoot = process.cwd();

	try {
		const policyFiles = findPolicyFiles(projectRoot);

		if (policyFiles.length === 0) {
			logger.warn("No RLS policies found.");
			logger.info("Create one with: bb rls create <table>\n");
			return;
		}

		logger.section("RLS Policies");

		console.log(chalk.dim(`${"Table".padEnd(20)}File`));
		console.log(chalk.dim("-".repeat(50)));

		for (const file of policyFiles) {
			const table = file.replace(".policy.ts", "");
			console.log(table.padEnd(20) + file);
		}

		console.log(chalk.dim(`\nTotal: ${policyFiles.length} policy file(s)\n`));
	} catch (error) {
		logger.error(`Failed to list policies: ${error}`);
	}
}

/**
 * Run the rls disable command
 * @param table - Table name to disable RLS for
 */
export async function runRlsDisable(table: string): Promise<void> {
	if (!table) {
		throw new Error("Table name is required. Usage: bb rls disable <table>");
	}

	const projectRoot = process.cwd();
	const policiesDir = path.join(projectRoot, POLICIES_DIR);
	const fileName = `${table}.policy.ts`;
	const filePath = path.join(policiesDir, fileName);

	console.log(chalk.yellow(`\n⚠️  This will remove ALL RLS policies from the "${table}" table!`));
	console.log(chalk.yellow("This may expose data that was previously protected.\n"));

	// Check if policy file exists
	if (!existsSync(filePath)) {
		logger.info(`No policy file found for "${table}". The table may not have RLS enabled.`);
		console.log(chalk.blue("\nTo disable RLS directly in the database, run:"));
		console.log(chalk.gray(`   psql -c "ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;"`));
		return;
	}

	// Show instructions for removing the policy
	console.log(chalk.blue("To disable RLS:"));
	console.log(`1. Delete the policy file: ${filePath}`);
	console.log("2. Run: bb migrate");
	console.log("\nOr disable directly in PostgreSQL:");
	console.log(chalk.gray(`   psql -c "ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;"`));
	console.log(chalk.gray(`   psql -c "DROP POLICY IF EXISTS ${table}_* ON ${table};"\n`));
}

/**
 * Main RLS command handler
 * @param args - Command arguments
 */
export async function runRlsCommand(args: string[]): Promise<void> {
	const subcommand = args[0];

	switch (subcommand) {
		case "create":
			await runRlsCreate(args[1]);
			break;
		case "list":
			await runRlsList();
			break;
		case "disable":
			await runRlsDisable(args[1]);
			break;
		default:
			console.log(`
${chalk.bold("RLS (Row Level Security) Commands")}

${chalk.green("bb rls create <table>")}  Create a new policy file for a table
${chalk.green("bb rls list")}              List all policy files
${chalk.green("bb rls disable <table>")}   Show how to disable RLS for a table

${chalk.gray("Examples:")}
  bb rls create users
  bb rls list
  bb rls disable users
`);
	}
}
