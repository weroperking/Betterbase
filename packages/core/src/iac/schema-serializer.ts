import { z } from "zod";
import type { IndexDefinition, SchemaDefinition, TableDefinition } from "./schema";

export interface SerializedColumn {
	name: string;
	type: string; // "string" | "number" | "boolean" | "id:users" | "array:string" | etc.
	optional: boolean;
	system: boolean; // true for _id, _createdAt, _updatedAt
}

export interface SerializedIndex {
	type: "index" | "uniqueIndex" | "searchIndex";
	name: string;
	fields: string[];
	searchField?: string;
}

export interface SerializedTable {
	name: string;
	columns: SerializedColumn[];
	indexes: SerializedIndex[];
}

export interface SerializedSchema {
	version: number; // bumped on each serialization
	tables: SerializedTable[];
	generated: string; // ISO timestamp
}

/** Converts a ZodTypeAny to a string type descriptor */
function zodToTypeString(schema: z.ZodTypeAny): string {
	if (schema instanceof z.ZodString) return "string";
	if (schema instanceof z.ZodNumber) return "number";
	if (schema instanceof z.ZodBoolean) return "boolean";
	if (schema instanceof z.ZodBigInt) return "int64";
	if (schema instanceof z.ZodNull) return "null";
	if (schema instanceof z.ZodAny) return "any";
	if (schema instanceof z.ZodDate) return "date";

	if (schema instanceof z.ZodBranded) {
		// v.id() — extract brand
		const brand = (schema as any)._def.type;
		const brandStr = (schema as any)._def.type?._def?.typeName ?? "string";
		return `id:${String((schema as any)._def.brandedType ?? "unknown")}`;
	}

	if (schema instanceof z.ZodOptional) {
		return zodToTypeString(schema.unwrap());
	}

	if (schema instanceof z.ZodArray) {
		return `array:${zodToTypeString(schema.element)}`;
	}

	if (schema instanceof z.ZodObject) {
		return "object";
	}

	if (schema instanceof z.ZodUnion) {
		const options = (schema as z.ZodUnion<any>).options as z.ZodTypeAny[];
		return `union:${options.map(zodToTypeString).join("|")}`;
	}

	if (schema instanceof z.ZodLiteral) {
		return `literal:${String(schema.value)}`;
	}

	return "unknown";
}

const SYSTEM_FIELDS = new Set(["_id", "_createdAt", "_updatedAt"]);

/** Serialize a full SchemaDefinition to a plain JSON-safe object */
export function serializeSchema(schema: SchemaDefinition): SerializedSchema {
	const tables: SerializedTable[] = [];

	for (const [tableName, tableDef] of Object.entries(schema._tables)) {
		const table = tableDef as TableDefinition;
		const columns: SerializedColumn[] = [];

		// Iterate over the full schema shape (includes system fields)
		for (const [colName, colSchema] of Object.entries(table._schema.shape)) {
			const isOptional = colSchema instanceof z.ZodOptional;
			const innerSchema = isOptional ? (colSchema as z.ZodOptional<any>).unwrap() : colSchema;

			columns.push({
				name: colName,
				type: zodToTypeString(colSchema),
				optional: isOptional,
				system: SYSTEM_FIELDS.has(colName),
			});
		}

		tables.push({
			name: tableName,
			columns,
			indexes: table._indexes,
		});
	}

	return {
		version: Date.now(),
		tables,
		generated: new Date().toISOString(),
	};
}

/** Load a serialized schema from disk (betterbase/_generated/schema.json) */
export async function loadSerializedSchema(path: string): Promise<SerializedSchema | null> {
	try {
		const content = await Bun.file(path).text();
		return JSON.parse(content) as SerializedSchema;
	} catch {
		return null;
	}
}

/** Save serialized schema to disk */
export async function saveSerializedSchema(schema: SerializedSchema, path: string): Promise<void> {
	await Bun.write(path, JSON.stringify(schema, null, 2));
}
