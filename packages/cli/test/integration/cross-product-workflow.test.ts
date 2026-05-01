/**
 * Cross-Product Integration — End-to-End Pipeline Tests
 *
 * Phase 4 deliverable: verifies that core CLI commands work together:
 *   1. migrate  (schema → migration files + apply)
 *   2. graphql generate  (schema → GraphQL SDL + server)
 *   3. ContextGenerator (schema + routes → .betterbase-context.json)
 *
 * This test validates the developer workflow in a realistic project layout.
 */

import { afterEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestProject } from "../fixtures/fixtures";

// ── Import real modules ─────────────────────────────────────────────────────────
const { runMigrateCommand } = await import("../../src/commands/migrate");
const { ContextGenerator } = await import("../../src/utils/context-generator");

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeProject() {
	const root = createTestProject({
		"package.json": JSON.stringify({ name: "test-cross-product" }),
		"src/db/schema.ts": `
import { sqliteTable, text, timestamp } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
		`,
		// Minimal drizzle config for migrate command
		"drizzle.config.ts": `
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  db: process.env.DB_PATH || './local.db',
  out: './drizzle/migrations',
});
		`,
	}).root;
	// Isolate the SQLite file inside the project directory
	process.env.DB_PATH = join(root, "local.db");
	return {
		root,
		cleanup: () => {
			delete process.env.DB_PATH;
			rmSync(root, { recursive: true, force: true });
		},
	};
}

function captureConsole() {
	const lines: string[] = [];
	const logSpy = mock((...args: unknown[]) => lines.push(args.map(String).join(" ")));
	const origLog = console.log;
	console.log = logSpy as unknown as typeof console.log;
	return { lines, restore: () => { console.log = origLog; } };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Cross-Product Integration Pipeline (real implementations)", () => {
	afterEach(() => {
		mock.restore();
	});

	it("migrate generates migrations and GraphQL schema, then context builds on them", async () => {
		const { root, cleanup } = makeProject();
		try {
			// Step 1: runMigrateCommand generates migrations, applies them, and generates GraphQL
			await runMigrateCommand({ projectRoot: root });

			// Assertions for migrate output
			expect(existsSync(join(root, "drizzle", "migrations", "0001_initial_up.sql"))).toBe(true);
			// GraphQL generation performed by migrate
			expect(existsSync(join(root, "src", "lib", "graphql", "schema.graphql"))).toBe(true);
			expect(existsSync(join(root, "src", "routes", "graphql.ts"))).toBe(true);

			// Step 2: ContextGenerator reads schema and routes to produce context
			const ctxGen = new ContextGenerator();
			const ctx = await ctxGen.generate(root);

			expect(ctx).toHaveProperty("tables");
			expect(ctx).toHaveProperty("routes");
			expect(ctx).toHaveProperty("graphql_schema");
			expect(ctx.graphql_endpoint).toBe("/api/graphql");
			expect(ctx.tables).toHaveProperty("users");
			expect(ctx.graphql_schema).toContain("type Query");
		} finally {
			cleanup();
		}
	});
});
