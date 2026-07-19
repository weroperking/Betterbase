import { Database } from "bun:sqlite";
import { accessSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { z } from "zod";
import { DEFAULT_DB_PATH } from "../constants";
import * as logger from "../utils/logger";
import * as prompts from "../utils/prompts";
import { withSpinner } from "../utils/spinner";
import { runGenerateGraphqlCommand } from "./graphql";
import {
	type AppliedMigration,
	type MigrationFile,
	calculateChecksum,
	getMigrationsTableSql,
	loadMigrationFiles,
} from "./migrate-utils";

const migrateOptionsSchema = z.object({
	preview: z.boolean().optional(),
	production: z.boolean().optional(),
	projectRoot: z.string().optional(),
});

export type MigrateCommandOptions = z.infer<typeof migrateOptionsSchema>;

export type MigrationChangeType =
	| "create_table"
	| "add_column"
	| "modify_column"
	| "drop_column"
	| "drop_table";

export interface MigrationChange {
	type: MigrationChangeType;
	table: string;
	column?: string;
	detail?: string;
	isDestructive: boolean;
}

interface DrizzleResult {
	success: boolean;
	stdout: string;
	stderr: string;
}

interface MigrationBackup {
	sourcePath: string;
	backupPath: string;
}

const DRIZZLE_DIR = "drizzle";
const DRIZZLE_TIMEOUT_MS = 30_000;

export async function runMigrateCommand(rawOptions: MigrateCommandOptions): Promise<void> {
	const startTime = Date.now();
	const options = migrateOptionsSchema.parse(rawOptions);
	const projectRoot = options.projectRoot ?? process.cwd();

	const changes = await withSpinner(
		"Generating migration files...",
		async () => await collectChangesFromGenerate(projectRoot),
		{ successText: "Migration files generated" },
	);
	displayDiff(changes);

	if (options.preview) {
		logger.info("Preview mode enabled. No migrations applied.");
		return;
	}

	if (options.production) {
		const proceed = await prompts.confirm({
			message: "Apply migrations to production now?",
			initial: false,
		});
		if (!proceed) {
			logger.warn("Migration cancelled by user.");
			return;
		}
	}

	let backup: MigrationBackup | null = null;
	if (changes.some((change) => change.isDestructive)) {
		backup = await backupDatabase(projectRoot);
		const confirmed = await confirmDestructive(changes);
		if (!confirmed) return;
	}

	logger.info("drizzle/ files are for preview; running push will apply changes.");
	const push = await withSpinner(
		"Applying migration changes...",
		async () => await runDrizzleKit(["push", ...getSqlitePushArgs(projectRoot)], projectRoot),
		{ successText: "Applied migration changes" },
	);

	if (!push.success) {
		await restoreBackup(backup);

		if (/\b(?:connect(?:ion)?|econnrefused|econnreset|enotfound|etimedout)\b/i.test(push.stderr)) {
			throw new Error(`Database connection failed while applying migration.\n${push.stderr}`);
		}

		if (/conflict|merge/i.test(push.stderr)) {
			throw new Error(
				`Migration conflict detected during push. Please resolve and retry.\n${push.stderr}`,
			);
		}

		throw new Error(`Migration push failed.\n${push.stderr || push.stdout}`);
	}

	logger.done(startTime, "Migration complete");

	logger.info("Regenerating GraphQL schema...");
	try {
		await runGenerateGraphqlCommand(projectRoot);
	} catch (err) {
		logger.warn(`Failed to regenerate GraphQL: ${(err as Error).message}`);
	}
}

function captureIdentifier(match: RegExpMatchArray, startIndex: number): string {
	return match[startIndex] ?? match[startIndex + 1] ?? match[startIndex + 2] ?? "";
}

/**
 * Build the extra drizzle-kit args needed for `push` against a local SQLite
 * database. The project's drizzle.config.ts may use the legacy `db` field
 * (which drizzle-kit 0.31 no longer reads for the connection url), so we
 * derive the url from DB_PATH and pass dialect/schema/url explicitly.
 */
function getSqlitePushArgs(projectRoot: string): string[] {
	const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;
	const url = dbPath.startsWith("file:") ? dbPath : `file:${dbPath}`;

	const candidateSchemas = ["src/db/schema.ts", "src/schema.ts", "schema.ts"];
	let schema = candidateSchemas[0];
	for (const candidate of candidateSchemas) {
		try {
			accessSync(path.join(projectRoot, candidate));
			schema = candidate;
			break;
		} catch {
			// try next candidate
		}
	}

	return ["--dialect", "sqlite", "--schema", schema, "--url", url];
}

async function runDrizzleKit(args: string[], cwd: string = process.cwd()): Promise<DrizzleResult> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), DRIZZLE_TIMEOUT_MS);

	const proc = Bun.spawn(["bunx", "drizzle-kit", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		signal: controller.signal,
	});

	try {
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		return { success: exitCode === 0, stdout, stderr };
	} catch {
		return {
			success: false,
			stdout: "",
			stderr: `drizzle-kit ${args.join(" ")} timed out after ${DRIZZLE_TIMEOUT_MS / 1000}s`,
		};
	} finally {
		clearTimeout(timeout);
	}
}

async function listSqlFiles(
	baseDir: string,
	cwd: string = process.cwd(),
): Promise<Map<string, string>> {
	const entries = new Map<string, string>();
	const root = path.join(cwd, baseDir);

	const walk = async (dir: string): Promise<void> => {
		try {
			await access(dir);
		} catch {
			return;
		}

		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);

			if (entry.isDirectory()) {
				await walk(fullPath);
				continue;
			}

			if (!fullPath.endsWith(".sql")) {
				continue;
			}

			entries.set(path.relative(root, fullPath), await Bun.file(fullPath).text());
		}
	};

	await walk(root);
	return entries;
}

export function analyzeMigration(sqlStatements: string[]): MigrationChange[] {
	const changes: MigrationChange[] = [];
	const ident = '(?:"([^"]+)"|`([^`]+)`|([\\w.-]+))';

	for (const statement of sqlStatements) {
		const sql = statement.trim();
		if (!sql) continue;

		const createTable = sql.match(
			new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+${ident}`, "i"),
		);
		if (createTable) {
			changes.push({
				type: "create_table",
				table: captureIdentifier(createTable, 1),
				isDestructive: false,
				detail: sql,
			});
			continue;
		}

		const dropTable = sql.match(new RegExp(`drop\\s+table(?:\\s+if\\s+exists)?\\s+${ident}`, "i"));
		if (dropTable) {
			changes.push({
				type: "drop_table",
				table: captureIdentifier(dropTable, 1),
				isDestructive: true,
				detail: sql,
			});
			continue;
		}

		const addColumn = sql.match(
			new RegExp(
				`alter\\s+table(?:\\s+if\\s+exists)?\\s+${ident}\\s+add\\s+column(?:\\s+if\\s+not\\s+exists)?\\s+${ident}`,
				"i",
			),
		);
		if (addColumn) {
			changes.push({
				type: "add_column",
				table: captureIdentifier(addColumn, 1),
				column: captureIdentifier(addColumn, 4),
				isDestructive: false,
				detail: sql,
			});
			continue;
		}

		const dropColumn = sql.match(
			new RegExp(
				`alter\\s+table(?:\\s+if\\s+exists)?\\s+${ident}\\s+drop\\s+column(?:\\s+if\\s+exists)?\\s+${ident}`,
				"i",
			),
		);
		if (dropColumn) {
			changes.push({
				type: "drop_column",
				table: captureIdentifier(dropColumn, 1),
				column: captureIdentifier(dropColumn, 4),
				isDestructive: true,
				detail: sql,
			});
			continue;
		}

		const alterColumn = sql.match(
			new RegExp(
				`alter\\s+table(?:\\s+if\\s+exists)?\\s+${ident}\\s+(?:alter\\s+column\\s+${ident}|rename\\s+column\\s+${ident})`,
				"i",
			),
		);
		if (alterColumn) {
			changes.push({
				type: "modify_column",
				table: captureIdentifier(alterColumn, 1),
				column: captureIdentifier(alterColumn, 4) || captureIdentifier(alterColumn, 7),
				isDestructive: /drop\s+not\s+null|set\s+not\s+null|set\s+data\s+type|rename\s+column/i.test(
					sql,
				),
				detail: sql,
			});
		}
	}

	return changes;
}

function displayDiff(changes: MigrationChange[]): void {
	logger.section("Migration Preview");

	if (changes.length === 0) {
		logger.dim("No schema changes detected.");
		return;
	}

	const newTables = changes.filter((c) => c.type === "create_table");
	const newColumns = changes.filter((c) => c.type === "add_column");
	const modified = changes.filter((c) => c.type === "modify_column");
	const destructive = changes.filter((c) => c.isDestructive);

	if (newTables.length) {
		console.log(chalk.green.bold("New Tables:"));
		for (const change of newTables) {
			console.log(chalk.green(`  + ${change.table}`));
		}
		logger.blank();
	}

	if (newColumns.length) {
		console.log(chalk.green.bold("New Columns:"));
		for (const change of newColumns) {
			console.log(chalk.green(`  + ${change.table}.${change.column ?? ""}`));
		}
		logger.blank();
	}

	if (modified.length) {
		console.log(chalk.yellow.bold("Modified Columns:"));
		for (const change of modified) {
			console.log(chalk.yellow(`  ~ ${change.table}.${change.column ?? ""}`));
		}
		logger.blank();
	}

	if (destructive.length) {
		console.log(chalk.red.bold("Destructive Changes:"));
		for (const change of destructive) {
			console.log(
				chalk.red(`  - ${change.type}: ${change.table}${change.column ? `.${change.column}` : ""}`),
			);
			console.log(chalk.red(`    ${logger.sym.warn} This will DELETE DATA`));
		}
		logger.blank();
	}
}

async function confirmDestructive(changes: MigrationChange[]): Promise<boolean> {
	const destructive = changes.filter((c) => c.isDestructive);
	if (destructive.length === 0) return true;

	logger.blank();
	console.log(
		chalk.yellow(logger.sym.warn) + " " + chalk.yellow.bold("Destructive operations detected:"),
	);
	for (const change of destructive) {
		console.log(
			`  ${chalk.red(logger.sym.bullet)} ${change.type}: ${change.table}${change.column ? `.${change.column}` : ""}`,
		);
	}
	logger.blank();

	const confirmation = await prompts.text({
		message: 'Type "delete data" to confirm:',
	});
	if (confirmation !== "delete data") {
		logger.warn("Confirmation phrase mismatch. Migration cancelled.");
		return false;
	}

	return true;
}

async function backupDatabase(
	projectRoot: string = process.cwd(),
): Promise<MigrationBackup | null> {
	const sourcePath = process.env.DB_PATH ?? DEFAULT_DB_PATH;

	try {
		await access(sourcePath);
	} catch {
		logger.warn(`No local database found at ${sourcePath}; skipping backup.`);
		return null;
	}

	const timestamp = new Date().toISOString().replace(/:/g, "-");
	const backupDir = path.join(projectRoot, "backups");
	await mkdir(backupDir, { recursive: true });

	const backupPath = path.join(backupDir, `db-${timestamp}.sqlite`);

	const db = new Database(sourcePath, { readonly: true });
	try {
		await Bun.write(backupPath, db.serialize());
	} finally {
		db.close();
	}

	logger.success(`Backup saved: ${backupPath}`);
	return { sourcePath, backupPath };
}

async function restoreBackup(backup: MigrationBackup | null): Promise<void> {
	if (backup === null) return;
	const bytes = await Bun.file(backup.backupPath).bytes();
	await Bun.write(backup.sourcePath, bytes);
	logger.warn(`Rollback complete. Restored database from ${backup.backupPath}`);
}

export function splitStatements(sql: string): string[] {
	const statements: string[] = [];
	let current = "";
	let inSingle = false;
	let inDouble = false;
	let inBacktick = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let i = 0; i < sql.length; i += 1) {
		const ch = sql[i];
		const next = sql[i + 1];

		if (inLineComment) {
			current += ch;
			if (ch === "") {
				inLineComment = false;
			}
			continue;
		}

		if (inBlockComment) {
			current += ch;
			if (ch === "*" && next === "/") {
				current += next;
				i += 1;
				inBlockComment = false;
			}
			continue;
		}

		if (!inSingle && !inDouble && !inBacktick && ch === "-" && next === "-") {
			current += ch + next;
			i += 1;
			inLineComment = true;
			continue;
		}

		if (!inSingle && !inDouble && !inBacktick && ch === "/" && next === "*") {
			current += ch + next;
			i += 1;
			inBlockComment = true;
			continue;
		}

		if (!inDouble && !inBacktick && ch === "'") {
			current += ch;
			if (inSingle && next === "'") {
				current += next;
				i += 1;
				continue;
			}
			inSingle = !inSingle;
			continue;
		}

		if (!inSingle && !inBacktick && ch === '"') {
			current += ch;
			if (inDouble && next === '"') {
				current += next;
				i += 1;
				continue;
			}
			inDouble = !inDouble;
			continue;
		}

		if (!inSingle && !inDouble && ch === "`") {
			current += ch;
			if (inBacktick && next === "`") {
				current += next;
				i += 1;
				continue;
			}
			inBacktick = !inBacktick;
			continue;
		}

		if (ch === ";" && !inSingle && !inDouble && !inBacktick && !inLineComment && !inBlockComment) {
			const statement = current.trim();
			if (statement.length > 0) {
				statements.push(statement);
			}
			current = "";
			continue;
		}

		current += ch;
	}

	const tail = current.trim();
	if (tail.length > 0) {
		statements.push(tail);
	}

	return statements;
}

async function collectChangesFromGenerate(projectRoot: string): Promise<MigrationChange[]> {
	const before = await listSqlFiles(DRIZZLE_DIR, projectRoot);
	const generate = await runDrizzleKit(["generate"], projectRoot);

	if (!generate.success) {
		if (/conflict|merge/i.test(generate.stderr)) {
			throw new Error(
				`Migration conflict detected. Resolve migration files manually.\n${generate.stderr}`,
			);
		}

		throw new Error(`Failed to generate migrations.\n${generate.stderr || generate.stdout}`);
	}

	const after = await listSqlFiles(DRIZZLE_DIR, projectRoot);
	const changedSql: string[] = [];

	for (const [relativePath, content] of after.entries()) {
		const previous = before.get(relativePath);
		if (previous === content) continue;

		// Intentionally analyze full changed file content: drizzle-kit typically creates new migration files,
		// so whole-file analysis is simpler and reliable. If in-place edits become common, switch to a true diff.
		changedSql.push(...splitStatements(content));
	}

	return analyzeMigration(changedSql);
}

async function getDatabaseConnection(): Promise<Database> {
	const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;

	// Try to load from DATABASE_URL first (for PostgreSQL)
	const dbUrl = process.env.DATABASE_URL || process.env.DB_URL;

	if (dbUrl && (dbUrl.startsWith("postgres") || dbUrl.startsWith("postgresql"))) {
		// For PostgreSQL, we'll use a simple approach with the native driver
		// This requires the project to have postgres installed
		logger.info("Using PostgreSQL database...");
		try {
			// Dynamic import for postgres (only available in Node.js environment)
			const { default: Postgres } = await import("postgres");
			const sql = Postgres(dbUrl);
			return sql as unknown as Database;
		} catch {
			logger.warn("postgres driver not available, falling back to SQLite");
		}
	}

	// Default to SQLite
	logger.info(`Using SQLite database at ${dbPath}...`);
	return new Database(dbPath);
}

/**
 * Ensure migrations tracking table exists
 */
async function ensureMigrationsTable(db: Database): Promise<void> {
	const tableSql = getMigrationsTableSql();
	const statements = splitStatements(tableSql);

	for (const stmt of statements) {
		if (stmt.trim()) {
			try {
				db.run(stmt);
			} catch (err) {
				// Ignore errors for SQLite (table might already exist with different schema)
				const errorMessage = err instanceof Error ? err.message : String(err);
				if (!errorMessage.includes("already exists")) {
					logger.warn(`Migration table setup: ${errorMessage}`);
				}
			}
		}
	}
}

/**
 * Get applied migrations from tracking table
 */
async function getAppliedMigrations(db: Database): Promise<AppliedMigration[]> {
	await ensureMigrationsTable(db);

	try {
		const result = db.query("SELECT * FROM _betterbase_migrations ORDER BY id ASC").all();
		return result as AppliedMigration[];
	} catch {
		// Table might not exist or be empty
		return [];
	}
}

/**
 * Remove a migration from tracking table
 */
async function removeMigration(db: Database, name: string): Promise<void> {
	try {
		db.run("DELETE FROM _betterbase_migrations WHERE name = ?", [name]);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.warn(`Failed to remove migration record: ${errorMessage}`);
	}
}

/**
 * Options for rollback command
 */
export interface MigrateRollbackOptions {
	steps?: number;
}

/**
 * Run the migration rollback command
 * Rolls back the last N migrations
 */
export async function runMigrateRollbackCommand(
	projectRoot: string,
	options: MigrateRollbackOptions = {},
): Promise<void> {
	const { steps = 1 } = options;

	logger.info(`Rolling back last ${steps} migration(s)...`);

	let db: Database;
	try {
		db = await getDatabaseConnection();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to connect to database: ${message}`);
	}

	const migrationsDir = path.join(projectRoot, "migrations");

	try {
		await access(migrationsDir);
	} catch {
		logger.warn(`Migrations directory not found at ${migrationsDir}`);
		logger.info("Create a 'migrations' folder with your migration files");
		return;
	}

	let allMigrations: MigrationFile[];
	try {
		allMigrations = await loadMigrationFiles(migrationsDir);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to load migrations: ${message}`);
	}

	const applied = await getAppliedMigrations(db);

	if (applied.length === 0) {
		logger.warn("No migrations to rollback");
		return;
	}

	let rolledBack = 0;
	const appliedReversed = [...applied].reverse();

	for (let i = 0; i < steps; i++) {
		const lastMigration = appliedReversed[i];
		if (!lastMigration) break;

		const migration = allMigrations.find((m) => m.name === lastMigration.name);

		if (!migration?.downSql) {
			throw new Error(
				`Migration ${lastMigration.name} has no down.sql file. Create ${lastMigration.name}_down.sql to enable rollback.`,
			);
		}

		logger.info(`Rolling back: ${migration.name}`);

		try {
			const statements = splitStatements(migration.downSql);
			for (const stmt of statements) {
				if (stmt.trim()) {
					db.run(stmt);
				}
			}

			await removeMigration(db, migration.name);

			logger.success(`Rolled back: ${migration.name}`);
			rolledBack++;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Failed to rollback ${migration.name}: ${message}`);
		}
	}

	logger.success(`Rolled back ${rolledBack} migration(s)`);
}

/**
 * Run the migration history command
 * Displays all applied migrations
 */
export async function runMigrateHistoryCommand(projectRoot: string): Promise<void> {
	let db: Database;
	try {
		db = await getDatabaseConnection();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to connect to database: ${message}`);
	}

	const applied = await getAppliedMigrations(db);

	if (applied.length === 0) {
		logger.info("No migrations applied");
		return;
	}

	console.log("\n" + chalk.bold("Migration History:") + "\n");
	console.log(
		chalk.gray("ID") +
			" | " +
			chalk.gray("Name".padEnd(25)) +
			" | " +
			chalk.gray("Applied At") +
			" | " +
			chalk.gray("Checksum"),
	);
	console.log(chalk.gray("-".repeat(80)));

	for (const m of applied) {
		const appliedDate =
			m.applied_at instanceof Date
				? m.applied_at.toISOString().replace("T", " ").slice(0, 19)
				: String(m.applied_at).replace("T", " ").slice(0, 19);
		console.log(
			m.id.toString().padEnd(2) +
				" | " +
				m.name.padEnd(25) +
				" | " +
				appliedDate +
				" | " +
				m.checksum.slice(0, 12) +
				"...",
		);
	}

	console.log("");
}
