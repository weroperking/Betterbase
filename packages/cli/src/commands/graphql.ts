/**
 * GraphQL CLI Commands
 *
 * Provides commands for generating GraphQL schema and accessing the playground.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as logger from "../utils/logger";
import { SchemaScanner } from "../utils/scanner";

/**
 * Type for Drizzle table objects - using a generic approach to avoid type issues
 */
type DrizzleTable = {
	name: string;
	columns: Record<string, { name: string; type: string }>;
};

/**
 * Map Drizzle column types to GraphQL types
 */
function drizzleTypeToGraphQL(drizzleType: string): string {
	const typeMap: Record<string, string> = {
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

	const lowerType = drizzleType.toLowerCase();
	return typeMap[lowerType] || "String";
}

/**
 * Load the schema module and extract tables
 */
function loadSchemaTables(projectRoot: string): Record<string, DrizzleTable> {
	const schemaPath = path.join(projectRoot, "src/db/schema.ts");

	if (!existsSync(schemaPath)) {
		throw new Error(`Schema file not found at ${schemaPath}`);
	}

	// Read the schema file and extract table definitions
	const schemaContent = readFileSync(schemaPath, "utf-8");

	// Parse table names from the schema file using regex
	// Look for patterns like: export const users = sqliteTable('users', {...})
	const tableRegex =
		/export\s+const\s+(\w+)\s*=\s*(?:sqliteTable|pgTable|mysqlTable)\s*\(\s*['"](\w+)['"]/g;
	const tables: Record<string, DrizzleTable> = {};

	for (const match of schemaContent.matchAll(tableRegex)) {
		const tableName = match[1];
		const dbName = match[2];

		// Extract columns for this table
		const columns: Record<string, { name: string; type: string }> = {};

		// Find the table definition block
		const tableBlockStart = schemaContent.indexOf(`export const ${tableName} =`);
		if (tableBlockStart === -1) continue;

		// Find the next export or end of file
		const nextExport = schemaContent.indexOf("export ", tableBlockStart + 1);
		const tableBlockEnd = nextExport === -1 ? schemaContent.length : nextExport;
		const tableBlock = schemaContent.substring(tableBlockStart, tableBlockEnd);

		// Extract column definitions with their types
		// Pattern: columnName: type('column_name', { ... }) or columnName: type(...)
		const columnRegex =
			/(\w+):\s*(text|integer|boolean|varchar|uuid|json|real|double|numeric|timestamp|datetime)\s*\([^)]*\)/g;
		for (const columnMatch of tableBlock.matchAll(columnRegex)) {
			const columnName = columnMatch[1];
			const columnType = columnMatch[2];
			// Skip internal columns
			if (!["createdAt", "updatedAt"].includes(columnName)) {
				columns[columnName] = { name: columnName, type: columnType };
			}
		}

		tables[tableName] = {
			name: dbName,
			columns,
		};
	}

	return tables;
}

/**
 * Generate GraphQL schema and resolvers from the database schema
 */
export async function runGenerateGraphqlCommand(projectRoot: string): Promise<void> {
	const resolvedRoot = path.resolve(projectRoot);
	const schemaPath = path.join(resolvedRoot, "src/db/schema.ts");

	if (!existsSync(schemaPath)) {
		throw new Error(`Schema file not found at ${schemaPath}`);
	}

	logger.info("Generating GraphQL schema...");

	// Load schema tables
	const tables = loadSchemaTables(resolvedRoot);

	if (Object.keys(tables).length === 0) {
		logger.warn("No tables found in schema. Please define tables in src/db/schema.ts first.");
		return;
	}

	// Create lib/graphql directory for the schema file
	const libDir = path.join(resolvedRoot, "src/lib");
	mkdirSync(libDir, { recursive: true });

	const graphqlDir = path.join(libDir, "graphql");
	mkdirSync(graphqlDir, { recursive: true });

	// Generate SDL representation
	const sdl = generateSDL(tables);

	// Write SDL to schema.graphql for reference
	const sdlPath = path.join(graphqlDir, "schema.graphql");
	writeFileSync(sdlPath, sdl);
	logger.success(`GraphQL SDL written to ${path.relative(resolvedRoot, sdlPath)}`);

	// Generate server setup file
	const serverContent = generateServerSetup(tables);

	const routesDir = path.join(resolvedRoot, "src/routes");
	mkdirSync(routesDir, { recursive: true });

	const serverPath = path.join(routesDir, "graphql.ts");
	writeFileSync(serverPath, serverContent);
	logger.success(`GraphQL server setup written to ${path.relative(resolvedRoot, serverPath)}`);

	logger.success("GraphQL API generated at /api/graphql");
	logger.info('Run "bb graphql playground" to open the GraphQL Playground');
}

/**
 * Open the GraphQL Playground in the browser
 */
export async function runGraphqlPlaygroundCommand(): Promise<void> {
	const port = process.env.PORT || "3000";
	const url = `http://localhost:${port}/api/graphql`;

	logger.info("Checking if server is running...");

	try {
		const response = await fetch(`${url.replace("/api/graphql", "")}/health`, {
			method: "GET",
			signal: AbortSignal.timeout(2000),
		});

		if (response.ok) {
			logger.info(`Opening GraphQL Playground at ${url}...`);
			// Use shell open command to open in default browser
			try {
				// Try to use platform-specific command
				if (process.platform === "darwin") {
					await Bun.spawn(["open", url]);
				} else if (process.platform === "win32") {
					await Bun.spawn(["cmd", "/c", "start", url]);
				} else {
					await Bun.spawn(["xdg-open", url]);
				}
				logger.success("GraphQL Playground opened in browser");
			} catch {
				logger.info(`Open ${url} in your browser to access the GraphQL Playground`);
			}
			return;
		}
	} catch {
		// Server not running
	}

	logger.error("Server is not running");
	logger.info('Please run "bb dev" first to start the development server');
	logger.info("Then open http://localhost:3000/api/graphql in your browser");
}

/**
 * Generate SDL from tables
 */
function generateSDL(tables: Record<string, DrizzleTable>): string {
	const lines: string[] = [
		"# GraphQL Schema",
		"# Auto-generated by BetterBase CLI",
		"",
		"scalar DateTime",
		"scalar JSON",
		"",
	];

	// Generate types for each table
	for (const [tableName, table] of Object.entries(tables)) {
		const typeName = toPascalCase(tableName);

		// Generate input type
		const createInputName = `Create${typeName}Input`;
		lines.push(`input ${createInputName} {`);

		const columnNames = Object.keys(table.columns);
		for (const colName of columnNames) {
			if (colName === "id") continue;
			const col = table.columns[colName];
			const graphqlType = drizzleTypeToGraphQL(col.type);
			lines.push(`  ${colName}: ${graphqlType}`);
		}
		lines.push("}");
		lines.push("");

		// Generate type
		lines.push(`type ${typeName} {`);
		for (const colName of columnNames) {
			const col = table.columns[colName];
			const graphqlType = drizzleTypeToGraphQL(col.type);
			const isRequired = colName === "id";
			const typeStr = isRequired ? `${graphqlType}!` : graphqlType;
			lines.push(`  ${colName}: ${typeStr}`);
		}
		lines.push("}");
		lines.push("");
	}

	// Generate Query type
	lines.push("type Query {");
	for (const tableName of Object.keys(tables)) {
		const typeName = toPascalCase(tableName);
		lines.push(`  ${tableName}(id: ID!): ${typeName}`);
		lines.push(`  ${tableName}List(limit: Int, offset: Int): [${typeName}]`);
	}
	lines.push("}");
	lines.push("");

	// Generate Mutation type
	lines.push("type Mutation {");
	for (const tableName of Object.keys(tables)) {
		const typeName = toPascalCase(tableName);
		const createInputName = `Create${typeName}Input`;
		lines.push(`  create${typeName}(input: ${createInputName}!): ${typeName}`);
		lines.push(`  update${typeName}(id: ID!, input: ${createInputName}): ${typeName}`);
		lines.push(`  delete${typeName}(id: ID!): Boolean`);
	}
	lines.push("}");

	return lines.join("\n");
}

/**
 * Generate the server setup file
 */
function generateServerSetup(tables: Record<string, DrizzleTable>): string {
	const tableNames = Object.keys(tables);

	// Generate type definitions
	const typeDefsLines: string[] = ["scalar DateTime", "scalar JSON", ""];

	for (const tableName of tableNames) {
		const typeName = toPascalCase(tableName);
		const columns = tables[tableName].columns;
		const columnNames = Object.keys(columns).filter((c) => c !== "id");

		// Input type
		typeDefsLines.push(`input Create${typeName}Input {`);
		for (const colName of columnNames) {
			const col = columns[colName];
			const graphqlType = drizzleTypeToGraphQL(col.type);
			typeDefsLines.push(`  ${colName}: ${graphqlType}`);
		}
		typeDefsLines.push("}");
		typeDefsLines.push("");

		// Type
		typeDefsLines.push(`type ${typeName} {`);
		for (const colName of Object.keys(columns)) {
			const col = columns[colName];
			const graphqlType = drizzleTypeToGraphQL(col.type);
			const isRequired = colName === "id";
			const typeStr = isRequired ? `${graphqlType}!` : graphqlType;
			typeDefsLines.push(`  ${colName}: ${typeStr}`);
		}
		typeDefsLines.push("}");
		typeDefsLines.push("");
	}

	// Query
	typeDefsLines.push("type Query {");
	for (const tableName of tableNames) {
		const typeName = toPascalCase(tableName);
		typeDefsLines.push(`  ${tableName}(id: ID!): ${typeName}`);
		typeDefsLines.push(`  ${tableName}List(limit: Int, offset: Int): [${typeName}]`);
	}
	typeDefsLines.push("}");
	typeDefsLines.push("");

	// Mutation
	typeDefsLines.push("type Mutation {");
	for (const tableName of tableNames) {
		const typeName = toPascalCase(tableName);
		typeDefsLines.push(`  create${typeName}(input: Create${typeName}Input!): ${typeName}`);
		typeDefsLines.push(`  update${typeName}(id: ID!, input: Create${typeName}Input): ${typeName}`);
		typeDefsLines.push(`  delete${typeName}(id: ID!): Boolean`);
	}
	typeDefsLines.push("}");

	const typeDefs = typeDefsLines.join("\n");

	// Generate resolvers
	const resolversLines: string[] = ["const Query = {"];

	for (const tableName of tableNames) {
		resolversLines.push(
			`  ${tableName}: (_: unknown, { id }: { id: string }, { db, schema }: { db: any; schema: any }) => {`,
		);
		resolversLines.push(
			`    return db.select().from(schema.${tableName}).where(eq(schema.${tableName}.id, id)).get();`,
		);
		resolversLines.push("  },");
		resolversLines.push(
			`  ${tableName}List: async (_: unknown, { limit = 50, offset = 0 }: { limit?: number; offset?: number }, { db, schema }: { db: any; schema: any }) => {`,
		);
		resolversLines.push(
			`    return db.select().from(schema.${tableName}).limit(limit).offset(offset).all();`,
		);
		resolversLines.push("  },");
	}

	resolversLines.push("};");
	resolversLines.push("");
	resolversLines.push("const Mutation = {");

	for (const tableName of tableNames) {
		const typeName = toPascalCase(tableName);
		resolversLines.push(
			`  create${typeName}: async (_: unknown, { input }: { input: Record<string, unknown> }, { db, schema }: { db: any; schema: any }) => {`,
		);
		resolversLines.push(
			`    const [result] = await db.insert(schema.${tableName}).values(input).returning().all();`,
		);
		resolversLines.push("    return result;");
		resolversLines.push("  },");
		resolversLines.push(
			`  update${typeName}: async (_: unknown, { id, input }: { id: string; input: Record<string, unknown> }, { db, schema }: { db: any; schema: any }) => {`,
		);
		resolversLines.push(
			`    const [result] = await db.update(schema.${tableName}).set(input).where(eq(schema.${tableName}.id, id)).returning().all();`,
		);
		resolversLines.push("    return result;");
		resolversLines.push("  },");
		resolversLines.push(
			`  delete${typeName}: async (_: unknown, { id }: { id: string }, { db, schema }: { db: any; schema: any }) => {`,
		);
		resolversLines.push(
			`    await db.delete(schema.${tableName}).where(eq(schema.${tableName}.id, id)).run();`,
		);
		resolversLines.push("    return true;");
		resolversLines.push("  },");
	}

	resolversLines.push("};");

	const resolvers = resolversLines.join("\n");

	return `/**
 * GraphQL Server Setup
 * 
 * Auto-generated by BetterBase CLI
 * 
 * This file sets up the GraphQL API endpoint at /api/graphql
 */

import { Hono } from 'hono';
import { createYoga, createSchema } from 'graphql-yoga';
import { db } from '../db';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

// Define GraphQL schema using SDL
const typeDefs = \`
${typeDefs}
\`;

// Resolvers
${resolvers}

// Create GraphQL schema
const graphqlSchema = createSchema({
  typeDefs,
  resolvers: {
    Query,
    Mutation,
  },
});

// Context function to provide db and schema to resolvers
const context = async ({ request }: { request: Request }) => ({
  db,
  schema,
});

// Create yoga instance
const yoga = createYoga({
  schema: graphqlSchema,
  context,
  graphqlEndpoint: '/api/graphql',
  // Enable playground in development
  playground: process.env.NODE_ENV !== 'production',
});

// Export the GraphQL route handler
export const graphqlRoute = new Hono();

graphqlRoute.all('/api/graphql', async (c) => {
  const url = new URL(c.req.url);
  const request = new Request(url.href, {
    method: c.req.method,
    headers: c.req.header(),
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? await c.req.text() : undefined,
  });
  
  const response = await yoga.handle(request);
  
  const body = await response.text();
  return c.newResponse(body, response.status);
});
`;
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
	return str
		.replace(/[-_](.)/g, (_match, c) => c.toUpperCase())
		.replace(/^(.)/, (_match, c) => c.toUpperCase());
}
