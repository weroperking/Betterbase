import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { z } from "zod";
import { DEFAULT_DB_PATH } from "../constants";
import * as logger from "../utils/logger";
import * as prompts from "../utils/prompts";
import {
	emitJson,
	ensureDir,
	fileTimestamp,
	listDir,
	removeFile,
	statePath,
} from "../utils/project-state";
import { runMigrateCommand } from "./migrate";

/**
 * `bb maintain` — Maintenance workflows (backup, restore, cleanup, optimize, migrate).
 */

export interface MaintainOptions {
	project?: string;
	json?: boolean;
	dryRun?: boolean;
	force?: boolean;
	keep?: string;
	file?: string;
}

interface BackupTable {
	name: string;
	rowCount: number;
	rows: unknown[];
}

interface BackupFile {
	createdAt: string;
	engine: "sqlite" | "postgres";
	tables: BackupTable[];
}

function resolveRoot(options: MaintainOptions): string {
	return options.project ?? process.cwd();
}

function backupsDir(projectRoot: string): string {
	return statePath(projectRoot, "backups");
}

function sqlitePath(): string {
	return process.env.DB_PATH ?? DEFAULT_DB_PATH;
}

function postgresUrl(): string | undefined {
	const url = process.env.DATABASE_URL || process.env.DB_URL;
	if (url && (url.startsWith("postgres") || url.startsWith("postgresql"))) return url;
	return undefined;
}

async function dumpSqlite(): Promise<BackupFile | null> {
	const dbPath = sqlitePath();
	if (!existsSync(dbPath)) return null;
	const { Database } = await import("bun:sqlite");
	const db = new Database(dbPath, { readonly: true });
	try {
		const tableRows = db
			.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
			.all() as Array<{ name: string }>;
		const tables: BackupTable[] = [];
		for (const { name } of tableRows) {
			const rows = db.query(`SELECT * FROM "${name}"`).all();
			tables.push({ name, rowCount: rows.length, rows });
		}
		return { createdAt: new Date().toISOString(), engine: "sqlite", tables };
	} finally {
		db.close();
	}
}

async function dumpPostgres(url: string): Promise<BackupFile> {
	const { default: Postgres } = await import("postgres");
	const sql = Postgres(url);
	try {
		const tableRows = (await sql`
			SELECT tablename FROM pg_tables WHERE schemaname = 'public'
		`) as unknown as Array<{ tablename: string }>;
		const tables: BackupTable[] = [];
		for (const { tablename } of tableRows) {
			const rows = (await sql.unsafe(`SELECT * FROM "${tablename}"`)) as unknown as unknown[];
			tables.push({ name: tablename, rowCount: rows.length, rows });
		}
		return { createdAt: new Date().toISOString(), engine: "postgres", tables };
	} finally {
		await sql.end();
	}
}

export async function runMaintainBackup(options: MaintainOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const pgUrl = postgresUrl();

	if (options.dryRun) {
		const engine = pgUrl ? "postgres" : "sqlite";
		if (options.json) emitJson({ action: "backup", dryRun: true, engine });
		else logger.info(`Would create a ${engine} backup.`);
		return;
	}

	let backup: BackupFile | null = null;
	try {
		backup = pgUrl ? await dumpPostgres(pgUrl) : await dumpSqlite();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (options.json) emitJson({ action: "backup", created: false, error: message });
		else logger.error(`Backup failed: ${message}`);
		process.exitCode = 1;
		return;
	}

	if (!backup) {
		if (options.json) emitJson({ action: "backup", created: false, reason: "no-database" });
		else logger.warn(`No database found at ${sqlitePath()} and no DATABASE_URL set.`);
		return;
	}

	await ensureDir(backupsDir(projectRoot));
	const file = path.join(backupsDir(projectRoot), `${fileTimestamp()}.sql.json`);
	await Bun.write(file, JSON.stringify(backup, null, 2));

	const totalRows = backup.tables.reduce((sum, t) => sum + t.rowCount, 0);
	if (options.json) {
		emitJson({ action: "backup", created: true, file, engine: backup.engine, tables: backup.tables.length, rows: totalRows });
		return;
	}
	logger.success(`Backup created: ${path.relative(projectRoot, file)}`);
	logger.keyValue("Engine", backup.engine);
	logger.keyValue("Tables", String(backup.tables.length));
	logger.keyValue("Rows", String(totalRows));
}

export async function runMaintainRestore(options: MaintainOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const dir = backupsDir(projectRoot);

	let target = options.file;
	if (!target) {
		const backups = (await listDir(dir)).filter((f) => f.endsWith(".sql.json")).sort();
		const latest = backups.at(-1);
		if (!latest) {
			if (options.json) emitJson({ action: "restore", restored: false, reason: "no-backups" });
			else logger.error("No backup files found. Provide one with --file.");
			process.exitCode = 1;
			return;
		}
		target = path.join(dir, latest);
	}

	if (!existsSync(target)) {
		if (options.json) emitJson({ action: "restore", restored: false, reason: "file-not-found", file: target });
		else logger.error(`Backup file not found: ${target}`);
		process.exitCode = 1;
		return;
	}

	const parsed = z
		.object({
			createdAt: z.string(),
			engine: z.enum(["sqlite", "postgres"]),
			tables: z.array(z.object({ name: z.string(), rowCount: z.number(), rows: z.array(z.unknown()) })),
		})
		.safeParse(JSON.parse(await Bun.file(target).text()));

	if (!parsed.success) {
		if (options.json) emitJson({ action: "restore", restored: false, reason: "invalid-backup" });
		else logger.error("Invalid backup file format.");
		process.exitCode = 1;
		return;
	}
	const backup = parsed.data;

	if (options.dryRun) {
		if (options.json) emitJson({ action: "restore", dryRun: true, engine: backup.engine, tables: backup.tables.length });
		else logger.info(`Would restore ${backup.tables.length} table(s) from ${path.basename(target)}.`);
		return;
	}

	if (!options.force && !options.json) {
		const proceed = await prompts.confirm({
			message: `Restore ${backup.tables.length} table(s)? This overwrites existing data.`,
			default: false,
		});
		if (!proceed) {
			logger.warn("Restore cancelled.");
			return;
		}
	}

	if (backup.engine === "sqlite") {
		const dbPath = sqlitePath();
		const { Database } = await import("bun:sqlite");
		const db = new Database(dbPath);
		try {
			for (const table of backup.tables) {
				for (const row of table.rows as Array<Record<string, unknown>>) {
					const keys = Object.keys(row);
					if (keys.length === 0) continue;
					const placeholders = keys.map(() => "?").join(", ");
					const cols = keys.map((k) => `"${k}"`).join(", ");
					try {
						db.run(
							`INSERT OR REPLACE INTO "${table.name}" (${cols}) VALUES (${placeholders})`,
							keys.map((k) => row[k] as never),
						);
					} catch (err) {
						logger.warn(`Skipped a row in ${table.name}: ${(err as Error).message}`);
					}
				}
			}
		} finally {
			db.close();
		}
	} else {
		const pgUrl = postgresUrl();
		if (!pgUrl) {
			logger.error("Backup is postgres but no DATABASE_URL is configured.");
			process.exitCode = 1;
			return;
		}
		const { default: Postgres } = await import("postgres");
		const sql = Postgres(pgUrl);
		try {
			for (const table of backup.tables) {
				for (const row of table.rows as Array<Record<string, unknown>>) {
					if (Object.keys(row).length === 0) continue;
					try {
						await sql`INSERT INTO ${sql(table.name)} ${sql(row)} ON CONFLICT DO NOTHING`;
					} catch (err) {
						logger.warn(`Skipped a row in ${table.name}: ${(err as Error).message}`);
					}
				}
			}
		} finally {
			await sql.end();
		}
	}

	if (options.json) emitJson({ action: "restore", restored: true, engine: backup.engine, tables: backup.tables.length });
	else logger.success(`Restored ${backup.tables.length} table(s) from ${path.basename(target)}.`);
}

export async function runMaintainCleanup(options: MaintainOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	const keep = options.keep ? Number.parseInt(options.keep, 10) : 5;
	if (Number.isNaN(keep) || keep < 0) {
		logger.error(`Invalid --keep value: ${options.keep}`);
		process.exitCode = 1;
		return;
	}

	const targets = [
		{ dir: backupsDir(projectRoot), match: (f: string) => f.endsWith(".sql.json") },
		{ dir: statePath(projectRoot, "logs"), match: (f: string) => f.endsWith(".log") },
		{ dir: statePath(projectRoot, "deployments"), match: (f: string) => f.endsWith(".json") },
	];

	const removed: string[] = [];
	for (const { dir, match } of targets) {
		const files = (await listDir(dir)).filter(match).sort();
		const toRemove = files.slice(0, Math.max(0, files.length - keep));
		for (const f of toRemove) {
			const full = path.join(dir, f);
			if (!options.dryRun) await removeFile(full);
			removed.push(path.relative(projectRoot, full));
		}
	}

	if (options.json) {
		emitJson({ action: "cleanup", dryRun: Boolean(options.dryRun), keep, removed });
		return;
	}

	logger.section(options.dryRun ? "Cleanup (dry-run)" : "Cleanup");
	if (removed.length === 0) {
		logger.info(`Nothing to clean up (keeping newest ${keep} of each type).`);
		return;
	}
	logger.success(`${options.dryRun ? "Would remove" : "Removed"} ${removed.length} old file(s):`);
	for (const f of removed) console.log(`  ${chalk.dim(logger.sym.bullet)} ${f}`);
}

export async function runMaintainOptimize(options: MaintainOptions): Promise<void> {
	const pgUrl = postgresUrl();
	const sqlitePresent = existsSync(sqlitePath());

	if (options.dryRun || (!pgUrl && !sqlitePresent)) {
		const statements = pgUrl ? ["VACUUM ANALYZE"] : ["VACUUM", "ANALYZE"];
		if (options.json) emitJson({ action: "optimize", dryRun: true, engine: pgUrl ? "postgres" : "sqlite", statements });
		else {
			logger.section("Optimize (preview)");
			if (!pgUrl && !sqlitePresent) logger.info("No reachable database. Would run:");
			for (const s of statements) console.log(`  ${chalk.dim(logger.sym.bullet)} ${s}`);
		}
		return;
	}

	try {
		if (pgUrl) {
			const { default: Postgres } = await import("postgres");
			const sql = Postgres(pgUrl);
			try {
				await sql.unsafe("VACUUM ANALYZE");
			} finally {
				await sql.end();
			}
		} else {
			const { Database } = await import("bun:sqlite");
			const db = new Database(sqlitePath());
			try {
				db.run("VACUUM");
				db.run("ANALYZE");
			} finally {
				db.close();
			}
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (options.json) emitJson({ action: "optimize", optimized: false, error: message });
		else logger.error(`Optimize failed: ${message}`);
		process.exitCode = 1;
		return;
	}

	if (options.json) emitJson({ action: "optimize", optimized: true, engine: pgUrl ? "postgres" : "sqlite" });
	else logger.success(`Database optimized (${pgUrl ? "postgres" : "sqlite"}).`);
}

export async function runMaintainMigrate(options: MaintainOptions): Promise<void> {
	const projectRoot = resolveRoot(options);
	if (options.json) {
		logger.info("Delegating to migrate...");
	}
	await runMigrateCommand({ preview: options.dryRun, projectRoot });
}
