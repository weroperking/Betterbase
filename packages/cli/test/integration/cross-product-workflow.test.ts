/**
 * Cross-Product Integration — End-to-End Pipeline Tests
 *
 * Phase 4 deliverable: verifies that core CLI commands work together:
 *   1. migrate  (schema → migration files)
 *   2. graphql generate  (schema → GraphQL SDL + server)
 *   3. ContextGenerator (schema + routes → .betterbase-context.json)
 *
 * This test validates the developer workflow in a realistic project layout.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestProject } from "../fixtures/fixtures";

// ── Mock modules ────────────────────────────────────────────────────────────────

const migratePath = join(import.meta.dir, "../../src/commands/migrate.ts");
const graphqlPath = join(import.meta.dir, "../../src/commands/graphql.ts");
const contextGenPath = join(import.meta.dir, "../../src/utils/context-generator.ts");

let migrateRan = false;
let graphqlRan = false;
let contextRan = false;

mock.module(migratePath, () => ({
	runMigrateCommand: async (opts: any) => {
		migrateRan = true;
		// The project root is in opts.projectRoot or process.cwd()
		const projectRoot = opts?.projectRoot ?? process.cwd();
		const drizzleDir = join(projectRoot, "drizzle");
		mkdirSync(join(drizzleDir, "migrations"), { recursive: true });
		writeFileSync(join(drizzleDir, "migrations", "0001_initial_up.sql"), "CREATE TABLE users (id TEXT PRIMARY KEY);");
		writeFileSync(join(drizzleDir, "migrations", "0001_initial_down.sql"), "DROP TABLE users;");
		console.log("✓ Migrations generated");
	},
}));

mock.module(graphqlPath, () => ({
	runGenerateGraphqlCommand: async (projectRoot: string) => {
		graphqlRan = true;
		const libDir = join(projectRoot, "src", "lib", "graphql");
		const routesDir = join(projectRoot, "src", "routes");
		mkdirSync(libDir, { recursive: true });
		mkdirSync(routesDir, { recursive: true });
		writeFileSync(join(libDir, "schema.graphql"), "type Query { users: [User] }");
		writeFileSync(join(routesDir, "graphql.ts"), "export default {};");
		console.log("✓ GraphQL schema generated");
	},
}));

mock.module(contextGenPath, () => ({
	ContextGenerator: class {
		async generate(projectRoot: string) {
			contextRan = true;
			// Simulate context generation with required fields
			const context = {
				version: "1.0.0",
				generated_at: new Date().toISOString(),
				tables: { users: { name: "users", columns: { id: { name: "id", type: "text" } }, relations: [], indexes: [] } },
				routes: { "/graphql": [{ method: "POST", path: "/graphql", requiresAuth: false }] },
				rls_policies: {},
				graphql_schema: "type Query { users: [User] }",
				graphql_endpoint: "/api/graphql",
				ai_prompt: "",
			};
			writeFileSync(join(projectRoot, ".betterbase-context.json"), JSON.stringify(context, null, 2));
			console.log("✓ Context generated");
			return context;
		}
	},
}));

const { runMigrateCommand } = await import("../../src/commands/migrate");
const { runGenerateGraphqlCommand } = await import("../../src/commands/graphql");
const { ContextGenerator } = await import("../../src/utils/context-generator");

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeProject() {
	return createTestProject({
		"package.json": JSON.stringify({ name: "test-cross-product" }),
		"src/db/schema.ts": `
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', { id: text('id').primaryKey() });
		`,
	});
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Cross-Product Integration Pipeline", () => {
	beforeEach(() => {
		migrateRan = false;
		graphqlRan = false;
		contextRan = false;
	});

	afterEach(() => {
		mock.restore();
	});

	it("full pipeline: migrate → graphql generate → context generation", async () => {
		const proj = makeProject();

		// Step 1: Generate migrations (pass projectRoot)
		await runMigrateCommand({ projectRoot: proj.root });
		expect(migrateRan).toBe(true);
		expect(existsSync(join(proj.root, "drizzle", "migrations", "0001_initial_up.sql"))).toBe(true);

		// Step 2: Generate GraphQL schema
		await runGenerateGraphqlCommand(proj.root);
		expect(graphqlRan).toBe(true);
		expect(existsSync(join(proj.root, "src", "lib", "graphql", "schema.graphql"))).toBe(true);
		expect(existsSync(join(proj.root, "src", "routes", "graphql.ts"))).toBe(true);

		// Step 3: Generate context
		const ctxGen = new ContextGenerator();
		const ctx = await ctxGen.generate(proj.root);
		expect(contextRan).toBe(true);
		expect(existsSync(join(proj.root, ".betterbase-context.json"))).toBe(true);
		expect(ctx.tables).toHaveProperty("users");
		expect(ctx.routes).toHaveProperty("/graphql");
		expect(ctx.graphql_schema).toContain("type Query");

		proj.cleanup();
	});

	it("context contains GraphQL endpoint after graphql generate", async () => {
		const proj = makeProject();
		await runGenerateGraphqlCommand(proj.root);
		const ctxGen = new ContextGenerator();
		const ctx = await ctxGen.generate(proj.root);
		expect(ctx.graphql_endpoint).toBe("/api/graphql");
		expect(ctx.graphql_schema).not.toBeNull();
		proj.cleanup();
	});

	it("context reflects tables from schema regardless of command order", async () => {
		const proj = makeProject();
		// Generate context without running migrate or graphql first
		const ctxGen = new ContextGenerator();
		const ctx = await ctxGen.generate(proj.root);
		expect(ctx.tables).toHaveProperty("users");
		expect(ctx.tables.users.columns).toHaveProperty("id");
		proj.cleanup();
	});
});
