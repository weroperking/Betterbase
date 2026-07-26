import { join } from "path";
import { serializeSchema, loadSerializedSchema, diffSchemas, formatDiff, type SchemaDiffChange } from "@betterbase/core/iac";
import chalk from "chalk";
import { info, success, warn } from "../../utils/logger";

export async function runIacDiff(projectRoot: string, options: { json?: boolean } = {}): Promise<void> {
	const betterbaseDir = join(projectRoot, "betterbase");
	const schemaFile = join(betterbaseDir, "schema.ts");
	const compiledFile = join(betterbaseDir, "_generated", "schema.compiled.js");
	const prevFile = join(betterbaseDir, "_generated", "schema.json");

	let schemaMod: any;
	try {
		schemaMod = await import(compiledFile);
	} catch {
		try {
			schemaMod = await import(schemaFile);
		} catch {
			console.error("Cannot load betterbase/schema.ts");
			process.exit(1);
		}
	}

	const schema = schemaMod.default ?? schemaMod.schema;
	if (!schema?._tables) {
		console.error("betterbase/schema.ts must export a default defineSchema(...)");
		process.exit(1);
	}

	const current = serializeSchema(schema);
	const previous = await loadSerializedSchema(prevFile);
	const diff = diffSchemas(previous, current);

	if (options.json) {
		const output = {
			isEmpty: diff.isEmpty,
			hasDestructive: diff.hasDestructive,
			changes: diff.changes.map((change: SchemaDiffChange) => ({
				type: change.type,
				table: change.table,
				column: change.column ?? null,
				index: change.index ?? null,
				destructive: change.destructive,
			})),
		};
		console.log(JSON.stringify(output, null, 2));
		return;
	}

	if (diff.isEmpty) {
		success("No pending schema changes.");
		return;
	}

	info("Pending schema changes:");
	console.log(formatDiff(diff));

	if (diff.hasDestructive) {
		warn("Destructive changes present. Use --force with bb iac sync to apply.");
	}
}