import { dirname, join } from "path";
import { loadSerializedSchema, saveSerializedSchema, serializeSchema } from "@betterbase/core/iac";
import { diffSchemas, formatDiff } from "@betterbase/core/iac";
import { generateMigration } from "@betterbase/core/iac";
import { generateDrizzleSchema } from "@betterbase/core/iac";
import chalk from "chalk";
import { mkdir, readdir, writeFile } from "fs/promises";
import { done, error, info, section, success, sym, warn } from "../../utils/logger";
import { withSpinner } from "../../utils/spinner";
import { detectEnvironmentConfig } from "./env-detector";
import { syncWithServer } from "./server-sync";

export async function runIacSync(
	projectRoot: string,
	opts: {
		force?: boolean;
		silent?: boolean;
		headless?: boolean; // NEW: Skip interactive prompts
		autoRegister?: boolean; // NEW: Auto-register with server
		environment?: string; // NEW: Target environment
	} = {},
) {
	const startTime = Date.now();
	const betterbaseDir = join(projectRoot, "betterbase");
	const schemaFile = join(betterbaseDir, "schema.ts");
	const prevFile = join(betterbaseDir, "_generated", "schema.json");
	const migrDir = join(projectRoot, "drizzle", "migrations");
	const drizzleOut = join(projectRoot, "src", "db", "schema.generated.ts");
	const genDir = join(betterbaseDir, "_generated");

	let schemaMod: any;
	try {
		schemaMod = await import(schemaFile);
	} catch (e: any) {
		if (!opts.silent) error(`Cannot load betterbase/schema.ts: ${e.message}`);
		throw new Error(`Cannot load betterbase/schema.ts: ${e.message}`);
	}

	const schema = schemaMod.default ?? schemaMod.schema;
	if (!schema?._tables) {
		if (!opts.silent) error("betterbase/schema.ts must export a default defineSchema(...)");
		throw new Error("betterbase/schema.ts must export a default defineSchema(...)");
	}

	const current = serializeSchema(schema);
	const previous = await loadSerializedSchema(prevFile);

	const diff = diffSchemas(previous, current);

	// Always persist the serialized schema snapshot as the source of truth,
	// even when there are no pending changes (e.g. a first sync with no
	// previous schema.json). This keeps betterbase/_generated/schema.json in
	// sync with the current schema.
	await mkdir(genDir, { recursive: true });
	await saveSerializedSchema(current, prevFile);

	if (diff.isEmpty && !opts.headless && !opts.autoRegister) {
		if (!opts.silent) success("Schema is up to date. No changes detected.");
		return;
	}

	if (!opts.silent) {
		section("IaC Sync");
		info("Pending schema changes:");
		console.log(formatDiff(diff));
		const grouped = {
			added: diff.changes.filter((c) => c.type.includes("add") || c.type.includes("create")),
			modified: diff.changes.filter((c) => c.type.includes("alter") || c.type.includes("modify")),
			removed: diff.changes.filter((c) => c.type.includes("drop") || c.type.includes("remove")),
		};
		if (grouped.added.length) {
			console.log(`  ${chalk.green("+ Added tables:")}`);
			grouped.added.forEach((c) => console.log(`    ${chalk.green(sym.bullet)} ${c.table}`));
		}
		if (grouped.modified.length) {
			console.log(`  ${chalk.yellow("~ Modified tables:")}`);
			grouped.modified.forEach((c) => console.log(`    ${chalk.yellow(sym.bullet)} ${c.table}`));
		}
		if (grouped.removed.length) {
			console.log(`  ${chalk.red("- Removed tables:")}`);
			grouped.removed.forEach((c) => console.log(`    ${chalk.red(sym.bullet)} ${c.table}`));
		}
	}

	if (diff.hasDestructive && !opts.force) {
		if (!opts.silent) {
			warn("Destructive changes detected. Re-run with --force to apply, or remove the changes.");
			warn(
				"Destructive operations:\n" +
					diff.changes
						.filter((c) => c.destructive)
						.map((c) => `  ⚠ ${c.type} ${c.table}${c.column ? "." + c.column : ""}`)
						.join("\n"),
			);
		}
		throw new Error("Destructive changes detected. Use --force to override.");
	}

	const existing = await readdir(migrDir).catch(() => [] as string[]);
	const seq = existing.filter((f) => f.endsWith(".sql")).length + 1;
	const label = "iac_auto";
	const migration = generateMigration(diff, seq, label);

	await mkdir(migrDir, { recursive: true });
	await writeFile(join(migrDir, migration.filename), migration.sql);
	if (!opts.silent) info(`Migration written: ${migration.filename}`);

	// 4. HEADLESS SYNC: Auto-sync with server
	if (opts.headless || opts.autoRegister) {
		if (!opts.silent) {
			section("Headless Sync");
			info("Synchronizing with @betterbase/server...");
		}

		// Detect environment configuration
		const envConfig = await detectEnvironmentConfig(projectRoot);

		// Sync with server (use current serialized schema)
		await syncWithServer(projectRoot, {
			schema: current,
			envConfig,
			environment: opts.environment ?? "local",
			force: opts.force,
		});

		if (!opts.silent) success("Headless sync complete.");
	}

	// 5. Apply migration locally (existing logic)
	await mkdir(dirname(drizzleOut), { recursive: true });
	if (opts.silent) {
		const drizzleCode = generateDrizzleSchema(current, "postgres");
		await writeFile(drizzleOut, drizzleCode);
	} else {
		await withSpinner(
			"Generating Drizzle schema...",
			async () => {
				const drizzleCode = generateDrizzleSchema(current, "postgres");
				await writeFile(drizzleOut, drizzleCode);
			},
			{ successText: "Schema generated" },
		);
	}

	if (!opts.silent) {
		info("Run the migration runner to apply changes to the database.");
		success("IaC sync complete.");
		done(startTime, "Schema synced");
	}
}
