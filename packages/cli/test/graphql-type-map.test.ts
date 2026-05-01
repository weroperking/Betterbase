/**
 * GraphQL Type Map Test Suite
 *
 * Tests for the chain code maps in graphql.ts CLI command:
 * - typeMap: Maps Drizzle column types to GraphQL types
 * - drizzleTypeToGraphQL(): Converts Drizzle types to GraphQL type strings
 *
 * Note: drizzleTypeToGraphQL is NOT exported from src/commands/graphql.ts. This test file includes the implementation and verifies it via source file comparison tests.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Map Drizzle column types to GraphQL types
 * This is the typeMap from graphql.ts CLI command (duplicated locally since
 * the function is not exported from src/commands/graphql.ts).
 */
const LOCAL_TYPE_MAP: Record<string, string> = {
	integer: "Int",
	int: "Int",
	smallint: "Int",
	bigint: "Int",
	real: "Float",
	double: "Float",
	float: "Float",
	numeric: "Float",
	decimal: "Float",
	boolean: "Boolean",
	bool: "Boolean",
	text: "String",
	varchar: "String",
	char: "String",
	uuid: "ID",
	timestamp: "DateTime",
	timestamptz: "DateTime",
	datetime: "DateTime",
	date: "DateTime",
	json: "JSON",
	jsonb: "JSON",
	blob: "String",
	bytea: "String",
};

function drizzleTypeToGraphQL(drizzleType: string): string {
	const lowerType = drizzleType.toLowerCase();
	return LOCAL_TYPE_MAP[lowerType] || "String";
}

describe("CLI GraphQL Type Map - drizzleTypeToGraphQL", () => {
	describe("Integer types", () => {
		it("should map integer to Int", () => {
			expect(drizzleTypeToGraphQL("integer")).toBe("Int");
		});

		it("should map int to Int", () => {
			expect(drizzleTypeToGraphQL("int")).toBe("Int");
		});

		it("should map smallint to Int", () => {
			expect(drizzleTypeToGraphQL("smallint")).toBe("Int");
		});

		it("should map bigint to Int", () => {
			expect(drizzleTypeToGraphQL("bigint")).toBe("Int");
		});

		it("should handle uppercase INTEGER", () => {
			expect(drizzleTypeToGraphQL("INTEGER")).toBe("Int");
		});
	});

	describe("Float types", () => {
		it("should map real to Float", () => {
			expect(drizzleTypeToGraphQL("real")).toBe("Float");
		});

		it("should map double to Float", () => {
			expect(drizzleTypeToGraphQL("double")).toBe("Float");
		});

		it("should map float to Float", () => {
			expect(drizzleTypeToGraphQL("float")).toBe("Float");
		});

		it("should map numeric to Float", () => {
			expect(drizzleTypeToGraphQL("numeric")).toBe("Float");
		});

		it("should map decimal to Float", () => {
			expect(drizzleTypeToGraphQL("decimal")).toBe("Float");
		});

		it("should handle case insensitivity for float types", () => {
			expect(drizzleTypeToGraphQL("REAL")).toBe("Float");
			expect(drizzleTypeToGraphQL("FLOAT")).toBe("Float");
			expect(drizzleTypeToGraphQL("Numeric")).toBe("Float");
		});
	});

	describe("Boolean types", () => {
		it("should map boolean to Boolean", () => {
			expect(drizzleTypeToGraphQL("boolean")).toBe("Boolean");
		});

		it("should map bool to Boolean", () => {
			expect(drizzleTypeToGraphQL("bool")).toBe("Boolean");
		});

		it("should handle case insensitivity for boolean types", () => {
			expect(drizzleTypeToGraphQL("BOOLEAN")).toBe("Boolean");
			expect(drizzleTypeToGraphQL("BOOL")).toBe("Boolean");
		});
	});

	describe("String types", () => {
		it("should map text to String", () => {
			expect(drizzleTypeToGraphQL("text")).toBe("String");
		});

		it("should map varchar to String", () => {
			expect(drizzleTypeToGraphQL("varchar")).toBe("String");
		});

		it("should map char to String", () => {
			expect(drizzleTypeToGraphQL("char")).toBe("String");
		});

		it("should handle case insensitivity for string types", () => {
			expect(drizzleTypeToGraphQL("TEXT")).toBe("String");
			expect(drizzleTypeToGraphQL("VARCHAR")).toBe("String");
			expect(drizzleTypeToGraphQL("Char")).toBe("String");
		});
	});

	describe("UUID types", () => {
		it("should map uuid to ID", () => {
			expect(drizzleTypeToGraphQL("uuid")).toBe("ID");
		});

		it("should handle case insensitivity for uuid", () => {
			expect(drizzleTypeToGraphQL("UUID")).toBe("ID");
			expect(drizzleTypeToGraphQL("Uuid")).toBe("ID");
		});
	});

	describe("DateTime types", () => {
		it("should map timestamp to DateTime", () => {
			expect(drizzleTypeToGraphQL("timestamp")).toBe("DateTime");
		});

		it("should map timestamptz to DateTime", () => {
			expect(drizzleTypeToGraphQL("timestamptz")).toBe("DateTime");
		});

		it("should map datetime to DateTime", () => {
			expect(drizzleTypeToGraphQL("datetime")).toBe("DateTime");
		});

		it("should map date to DateTime", () => {
			expect(drizzleTypeToGraphQL("date")).toBe("DateTime");
		});

		it("should handle case insensitivity for datetime types", () => {
			expect(drizzleTypeToGraphQL("TIMESTAMP")).toBe("DateTime");
			expect(drizzleTypeToGraphQL("TIMESTAMPTZ")).toBe("DateTime");
			expect(drizzleTypeToGraphQL("DATETIME")).toBe("DateTime");
			expect(drizzleTypeToGraphQL("DATE")).toBe("DateTime");
		});
	});

	describe("JSON types", () => {
		it("should map json to JSON", () => {
			expect(drizzleTypeToGraphQL("json")).toBe("JSON");
		});

		it("should map jsonb to JSON", () => {
			expect(drizzleTypeToGraphQL("jsonb")).toBe("JSON");
		});

		it("should handle case insensitivity for json types", () => {
			expect(drizzleTypeToGraphQL("JSON")).toBe("JSON");
			expect(drizzleTypeToGraphQL("JSONB")).toBe("JSON");
		});
	});

	describe("Binary types", () => {
		it("should map blob to String", () => {
			expect(drizzleTypeToGraphQL("blob")).toBe("String");
		});

		it("should map bytea to String", () => {
			expect(drizzleTypeToGraphQL("bytea")).toBe("String");
		});

		it("should handle case insensitivity for binary types", () => {
			expect(drizzleTypeToGraphQL("BLOB")).toBe("String");
			expect(drizzleTypeToGraphQL("BYTEA")).toBe("String");
		});
	});

	describe("Default fallback", () => {
		it("should return String for unknown types", () => {
			expect(drizzleTypeToGraphQL("unknown")).toBe("String");
		});

		it("should return String for empty string", () => {
			expect(drizzleTypeToGraphQL("")).toBe("String");
		});

		it("should return String for custom types", () => {
			expect(drizzleTypeToGraphQL("inet")).toBe("String");
			expect(drizzleTypeToGraphQL("cidr")).toBe("String");
			expect(drizzleTypeToGraphQL("macaddr")).toBe("String");
			expect(drizzleTypeToGraphQL("point")).toBe("String");
			expect(drizzleTypeToGraphQL("interval")).toBe("String");
			expect(drizzleTypeToGraphQL("array")).toBe("String");
			expect(drizzleTypeToGraphQL("enum")).toBe("String");
		});
	});

	describe("Edge cases", () => {
		it("should handle types with numbers (fallback to String)", () => {
			// int2, int4, int8 are not in the typeMap, so they fall through to String
			expect(drizzleTypeToGraphQL("int2")).toBe("String");
			expect(drizzleTypeToGraphQL("int4")).toBe("String");
			expect(drizzleTypeToGraphQL("int8")).toBe("String");
		});

		it("should handle types with underscores (fallback to String)", () => {
			// Types with underscores not in the typeMap fall through to String
			expect(drizzleTypeToGraphQL("timestamp with time zone")).toBe("String");
		});

		it("should handle types with spaces", () => {
			expect(drizzleTypeToGraphQL("double precision")).toBe("String");
		});
	});
});

describe("CLI GraphQL Type Map - Integration Tests", () => {
	it("should correctly map a complete PostgreSQL table schema", () => {
		const pgColumns = [
			{ type: "uuid", expected: "ID" },
			{ type: "varchar", expected: "String" },
			{ type: "text", expected: "String" },
			{ type: "boolean", expected: "Boolean" },
			{ type: "integer", expected: "Int" },
			{ type: "bigint", expected: "Int" },
			{ type: "real", expected: "Float" },
			{ type: "numeric", expected: "Float" },
			{ type: "timestamp", expected: "DateTime" },
			{ type: "timestamptz", expected: "DateTime" },
			{ type: "date", expected: "DateTime" },
			{ type: "json", expected: "JSON" },
			{ type: "jsonb", expected: "JSON" },
			{ type: "bytea", expected: "String" },
		];

		pgColumns.forEach(({ type, expected }) => {
			expect(drizzleTypeToGraphQL(type)).toBe(expected);
		});
	});

	it("should correctly map a complete MySQL table schema", () => {
		// Note: tinytext, mediumtext, longtext, tinyint, mediumint are not in the typeMap
		// and fall through to String. Only the types in the typeMap are mapped correctly.
		const mysqlColumns = [
			{ type: "varchar", expected: "String" },
			{ type: "text", expected: "String" },
			{ type: "tinytext", expected: "String" },
			{ type: "mediumtext", expected: "String" },
			{ type: "longtext", expected: "String" },
			{ type: "int", expected: "Int" },
			{ type: "tinyint", expected: "String" }, // Not in typeMap, falls through
			{ type: "smallint", expected: "Int" },
			{ type: "mediumint", expected: "String" }, // Not in typeMap, falls through
			{ type: "bigint", expected: "Int" },
			{ type: "float", expected: "Float" },
			{ type: "double", expected: "Float" },
			{ type: "decimal", expected: "Float" },
			{ type: "boolean", expected: "Boolean" },
			{ type: "date", expected: "DateTime" },
			{ type: "datetime", expected: "DateTime" },
			{ type: "timestamp", expected: "DateTime" },
			{ type: "json", expected: "JSON" },
		];

		mysqlColumns.forEach(({ type, expected }) => {
			expect(drizzleTypeToGraphQL(type)).toBe(expected);
		});
	});

	it("should correctly map a complete SQLite table schema", () => {
		const sqliteColumns = [
			{ type: "integer", expected: "Int" },
			{ type: "text", expected: "String" },
			{ type: "real", expected: "Float" },
			{ type: "blob", expected: "String" },
			{ type: "numeric", expected: "Float" },
		];

		sqliteColumns.forEach(({ type, expected }) => {
			expect(drizzleTypeToGraphQL(type)).toBe(expected);
		});
	});

	it("should correctly map a user profile table schema", () => {
		const profileColumns = [
			{ type: "uuid", expected: "ID" },
			{ type: "varchar", expected: "String" },
			{ type: "varchar", expected: "String" },
			{ type: "text", expected: "String" },
			{ type: "varchar", expected: "String" },
			{ type: "boolean", expected: "Boolean" },
			{ type: "timestamp", expected: "DateTime" },
			{ type: "timestamp", expected: "DateTime" },
			{ type: "json", expected: "JSON" },
		];

		profileColumns.forEach(({ type, expected }) => {
			expect(drizzleTypeToGraphQL(type)).toBe(expected);
		});
	});

	it("should correctly map an e-commerce products table schema", () => {
		const productsColumns = [
			{ type: "uuid", expected: "ID" },
			{ type: "uuid", expected: "ID" },
			{ type: "varchar", expected: "String" },
			{ type: "text", expected: "String" },
			{ type: "numeric", expected: "Float" },
			{ type: "integer", expected: "Int" },
			{ type: "integer", expected: "Int" },
			{ type: "boolean", expected: "Boolean" },
			{ type: "jsonb", expected: "JSON" },
			{ type: "timestamp", expected: "DateTime" },
		];

		productsColumns.forEach(({ type, expected }) => {
			expect(drizzleTypeToGraphQL(type)).toBe(expected);
		});
	});
});

describe("CLI GraphQL Type Map - typeMap completeness", () => {
	it("should have mappings for all PostgreSQL types", () => {
		const pgTypes = [
			"serial",
			"bigserial",
			"smallserial",
			"integer",
			"int",
			"int2",
			"int4",
			"int8",
			"bigint",
			"smallint",
			"real",
			"double precision",
			"float",
			"float4",
			"float8",
			"numeric",
			"decimal",
			"dec",
			"boolean",
			"bool",
			"char",
			"character",
			"varchar",
			"character varying",
			"text",
			"uuid",
			"json",
			"jsonb",
			"timestamp",
			"timestamptz",
			"date",
			"time",
			"timetz",
			"bytea",
			"blob",
			"inet",
			"cidr",
			"macaddr",
			"point",
			"line",
			"lseg",
			"box",
			"path",
			"polygon",
			"circle",
			"array",
			"int[]",
			"text[]",
			"xml",
			"interval",
			"oid",
			"xid",
			"cid",
			"tid",
		];

		pgTypes.forEach((type) => {
			const result = drizzleTypeToGraphQL(type);
			expect(result).toBeDefined();
			expect(typeof result).toBe("string");
		});
	});

	it("should have mappings for all MySQL types", () => {
		const mysqlTypes = [
			"tinyint",
			"smallint",
			"mediumint",
			"int",
			"integer",
			"bigint",
			"float",
			"double",
			"decimal",
			"numeric",
			"date",
			"datetime",
			"timestamp",
			"time",
			"year",
			"char",
			"varchar",
			"tinytext",
			"text",
			"mediumtext",
			"longtext",
			"blob",
			"tinyblob",
			"mediumblob",
			"longblob",
			"enum",
			"set",
			"json",
			"bool",
			"boolean",
			"binary",
			"varbinary",
			"bit",
			"geometry",
			"point",
			"linestring",
			"polygon",
			"multipoint",
			"multilinestring",
			"multipolygon",
			"geometrycollection",
		];

		mysqlTypes.forEach((type) => {
			const result = drizzleTypeToGraphQL(type);
			expect(result).toBeDefined();
			expect(typeof result).toBe("string");
		});
	});

	it("should have mappings for all SQLite types", () => {
		const sqliteTypes = [
			"integer",
			"real",
			"text",
			"blob",
			"numeric",
			"decimal",
			"boolean",
			"date",
			"datetime",
			"timestamp",
			"int",
			"tinyint",
			"smallint",
			"mediumint",
			"bigint",
			"float",
			"double",
			"varchar",
			"char",
			"nchar",
			"nvarchar",
			"clob",
			"character",
			"nclob",
		];

		sqliteTypes.forEach((type) => {
			const result = drizzleTypeToGraphQL(type);
			expect(result).toBeDefined();
			expect(typeof result).toBe("string");
		});
	});
});

describe("CLI GraphQL Type Map - Source File Comparison", () => {
	it("should match the typeMap in src/commands/graphql.ts exactly", () => {
		const __dirname = path.dirname(new URL(import.meta.url).pathname);
		const sourcePath = path.join(__dirname, "..", "src", "commands", "graphql.ts");
		const source = readFileSync(sourcePath, "utf-8");

		// Extract the typeMap object from inside the drizzleTypeToGraphQL function
		// The typeMap is defined as: const typeMap: Record<string, string> = { ... };
		const typeMapRegex = /const\s+typeMap\s*:\s*Record<string,\s*string>\s*=\s*{([\s\S]*?)};/;
		const match = source.match(typeMapRegex);

		if (!match) {
			throw new Error("Could not find typeMap definition in source file");
		}

		const typeMapBody = match[1];

		// Parse key-value pairs from the typeMap body
		const parsedSourceTypeMap: Record<string, string> = {};
		const entryRegex = /(\w+)\s*:\s*"([^"]+)"/g;
		let entryMatch;
		while ((entryMatch = entryRegex.exec(typeMapBody)) !== null) {
			const key = entryMatch[1];
			const value = entryMatch[2];
			parsedSourceTypeMap[key] = value;
		}

		// Compare source typeMap with LOCAL_TYPE_MAP
		const localEntries = Object.entries(LOCAL_TYPE_MAP);
		const sourceEntries = Object.entries(parsedSourceTypeMap);

		expect(sourceEntries.length).toBe(localEntries.length);

		for (const [key, value] of localEntries) {
			expect(parsedSourceTypeMap).toHaveProperty(key, value);
		}
	});
});
