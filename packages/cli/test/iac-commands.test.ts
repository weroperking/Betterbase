/**
 * IAC CLI Commands and Convex Migration Test Suite
 *
 * Tests for:
 * - runIacAnalyze from commands/iac/analyze.ts
 * - runIacExport from commands/iac/export.ts
 * - runIacImport from commands/iac/import.ts
 * - runMigrateFromConvex from commands/migrate/from-convex.ts
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

// Import real functions
import { runIacAnalyze } from "../src/commands/iac/analyze";
import { runIacExport } from "../src/commands/iac/export";
import { runIacImport } from "../src/commands/iac/import";
import { runMigrateFromConvex } from "../src/commands/migrate/from-convex";

const tempDir = os.tmpdir();

// Helper to capture console output
async function captureConsole(fn: () => Promise<void>): Promise<string> {
	const originalLog = console.log;
	const originalError = console.error;
	const output: string[] = [];
	console.log = (...args: any[]) => {
		output.push(args.join(" "));
	};
	console.error = (...args: any[]) => {
		output.push(args.join(" "));
	};
	try {
		await fn();
		return output.join("\n");
	} finally {
		console.log = originalLog;
		console.error = originalError;
	}
}

describe("runIacAnalyze", () => {
	const testProjectRoot = join(tempDir, "iac-analyze-test");

	beforeEach(() => {
		mkdirSync(join(testProjectRoot, "betterbase", "queries"), { recursive: true });
		mkdirSync(join(testProjectRoot, "betterbase", "mutations"), { recursive: true });
		mkdirSync(join(testProjectRoot, "betterbase", "actions"), { recursive: true });
	});

	afterEach(() => {
		rmSync(testProjectRoot, { recursive: true, force: true });
	});

	it("should analyze queries and return results", async () => {
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "sample.ts"),
			`
			export const getSample = query({
				run: async (ctx) => ctx.db.query("sample").take(5).collect(),
			});
			`,
		);
		const output = await captureConsole(() => runIacAnalyze(testProjectRoot, { output: "json" }));
		const jsonMatch = output.match(/\[.*\]/s);
		expect(jsonMatch).not.toBeNull();
		const results = JSON.parse(jsonMatch![0]);
		expect(Array.isArray(results)).toBe(true);
		expect(results.length).toBe(1);
		expect(results[0].complexity).toBe("low");
		expect(results[0].issues).toEqual([]);
	});

	it("should detect N+1 query patterns", async () => {
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "nplus1.ts"),
			`
			export const getNested = query({
				run: async (ctx) => {
					const users = ctx.db.query("users").take(100).collect();
					return Promise.all(users.map(async (u) => {
						return ctx.db.query("posts").filter({ userId: u.id }).take(5).collect();
					}));
				},
			});
			`,
		);
		const output = await captureConsole(() => runIacAnalyze(testProjectRoot));
		expect(output).toContain("N+1");
		// Should be medium due to N+1 pattern; not high because bounded
		expect(output).toContain("medium");
	});

	it("should detect missing index usage", async () => {
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "filterNoIndex.ts"),
			`
			export const getFiltered = query({
				run: async (ctx) => {
					return ctx.db.query("items").filter({ status: "active" }).take(10).collect();
				},
			});
			`,
		);
		const output = await captureConsole(() => runIacAnalyze(testProjectRoot));
		expect(output).toContain("index");
		expect(output).toContain("medium");
	});

	it("should output results in json format", async () => {
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "jsonTest.ts"),
			`
			export const getData = query({
				run: async (ctx) => ctx.db.query("data").take(1).collect(),
			});
			`,
		);
		const output = await captureConsole(() => runIacAnalyze(testProjectRoot, { output: "json" }));
		const jsonMatch = output.match(/\[.*\]/s);
		expect(jsonMatch).not.toBeNull();
		const parsed = JSON.parse(jsonMatch![0]);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0]).toHaveProperty("path");
		expect(parsed[0]).toHaveProperty("complexity");
		expect(parsed[0]).toHaveProperty("issues");
		expect(parsed[0]).toHaveProperty("suggestions");
	});

	it("should calculate complexity correctly", async () => {
		// Low: bounded, indexed
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "low.ts"),
			`
			export const low = query({
				run: async (ctx) => ctx.db.query("t").filter({ x: 1 }).withIndex("idx").take(5).collect(),
			});
			`,
		);
		// Medium: filter without index (but bounded)
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "medium.ts"),
			`
			export const medium = query({
				run: async (ctx) => ctx.db.query("t").filter({ x: 1 }).take(5).collect(),
			});
			`,
		);
		// High: unbounded
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "high.ts"),
			`
			export const high = query({
				run: async (ctx) => ctx.db.query("t").collect(),
			});
			`,
		);
		const output = await captureConsole(() => runIacAnalyze(testProjectRoot));
		// Summary should show 1 low, 1 medium, 1 high
		expect(output).toContain("Total: 3 | High: 1 | Medium: 1 | Low: 1");
	});

	it("should detect N+1 query patterns using for loops", async () => {
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "nplus1-loop.ts"),
			`
			export const getWithLoop = query({
				run: async (ctx) => {
					const users = ctx.db.query("users").take(50).collect();
					const results = [];
					for (const u of users) {
						results.push(ctx.db.query("posts").filter({ userId: u.id }).take(5).collect());
					}
					return results;
				},
			});
			`,
		);
		const output = await captureConsole(() => runIacAnalyze(testProjectRoot));
		expect(output).toContain("N+1");
	});

	it("should detect manual join patterns", async () => {
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "join.ts"),
			`
			export const joinQuery = query({
				run: async (ctx) => {
					const sql = \`SELECT u.*, p.* FROM users u JOIN posts p ON u.id = p.userId\`;
					return ctx.db.execute(sql);
				},
			});
			`,
		);
		const output = await captureConsole(() => runIacAnalyze(testProjectRoot));
		expect(output).toContain("join");
	});

	it("should handle multiple query files", async () => {
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "users.ts"),
			`
			export const getUsers = query({
				run: async (ctx) => ctx.db.query("users").take(10).collect(),
			});
			`,
		);
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "posts.ts"),
			`
			export const getPosts = query({
				run: async (ctx) => ctx.db.query("posts").take(5).collect(),
			});
			`,
		);
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "comments.ts"),
			`
			export const getComments = query({
				run: async (ctx) => {
					const posts = ctx.db.query("posts").take(10).collect();
					return Promise.all(posts.map(p => ctx.db.query("comments").filter({ postId: p.id }).take(3).collect()));
				},
			});
			`,
		);
		const output = await captureConsole(() => runIacAnalyze(testProjectRoot, { output: "json" }));
		const jsonMatch = output.match(/\[.*\]/s);
		expect(jsonMatch).not.toBeNull();
		const results = JSON.parse(jsonMatch![0]);
		expect(results).toHaveLength(3);
	});

	it("should throw when queries directory is missing", async () => {
		rmSync(join(testProjectRoot, "betterbase", "queries"), { recursive: true, force: true });
		await expect(runIacAnalyze(testProjectRoot)).rejects.toThrow();
	});

	it("should support nested betterbase directory structure", async () => {
		mkdirSync(join(testProjectRoot, "betterbase", "queries", "admin"), { recursive: true });
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "admin", "dashboard.ts"),
			`
			export const getDashboardData = query({
				run: async (ctx) => {
					const users = ctx.db.query("users").take(50).collect();
					return Promise.all(users.map(u => 
						ctx.db.query("posts").filter({ userId: u.id }).take(10).collect()
					));
				},
			});
			`,
		);
		const output = await captureConsole(() => runIacAnalyze(testProjectRoot));
		expect(output).toContain("N+1");
		expect(output).toContain("medium");
	});
});

describe("runIacExport", () => {
	const testProjectRoot = join(tempDir, "iac-export-test");

	beforeEach(() => {
		mkdirSync(join(testProjectRoot, "betterbase"), { recursive: true });
	});

	afterEach(() => {
		rmSync(testProjectRoot, { recursive: true, force: true });
	});

	it("should handle json format export", async () => {
		const output = await captureConsole(() =>
			runIacExport(testProjectRoot, { format: "json", output: "./backup" }),
		);
		expect(output).toContain("Format: json");
	});

	it("should handle sql format export", async () => {
		const output = await captureConsole(() =>
			runIacExport(testProjectRoot, { format: "sql", output: "./backup.sql" }),
		);
		expect(output).toContain("Format: sql");
	});

	it("should use default format when not specified", async () => {
		const output = await captureConsole(() =>
			runIacExport(testProjectRoot, { output: "./backup" }),
		);
		expect(output).toContain("Format: json");
	});

	it("should handle output path correctly", async () => {
		const output = await captureConsole(() =>
			runIacExport(testProjectRoot, { output: "/path/to/export" }),
		);
		expect(output).toContain("/path/to/export");
	});

	it("should handle table-specific export", async () => {
		const output = await captureConsole(() =>
			runIacExport(testProjectRoot, { output: "./backup", table: "comments" }),
		);
		expect(output).toContain("Table: comments");
	});

	it("should accept absolute output paths", async () => {
		const absPath = join(tempDir, "full-backup");
		const output = await captureConsole(() =>
			runIacExport(testProjectRoot, { format: "json", output: absPath }),
		);
		expect(output).toContain(absPath);
	});

	it("should accept custom table names with special characters", async () => {
		const output = await captureConsole(() =>
			runIacExport(testProjectRoot, { format: "json", output: "./backup", table: "user_profiles_v2" }),
		);
		expect(output).toContain("user_profiles_v2");
	});

	it("should log export initialization success", async () => {
		const output = await captureConsole(() =>
			runIacExport(testProjectRoot, { format: "json", output: "./backup" }),
		);
		expect(output).toContain("✓");
		expect(output).toContain("Export command initialized");
	});

	it("should handle nested output directories", async () => {
		const nestedPath = join(testProjectRoot, "exports", "daily", "backup");
		const output = await captureConsole(() =>
			runIacExport(testProjectRoot, { format: "json", output: nestedPath }),
		);
		expect(output).toContain(nestedPath);
	});
});

describe("runIacImport", () => {
	const testProjectRoot = join(tempDir, "iac-import-test");

	beforeEach(() => {
		mkdirSync(testProjectRoot, { recursive: true });
		mkdirSync(join(testProjectRoot, "betterbase"), { recursive: true });
	});

	afterEach(() => {
		rmSync(testProjectRoot, { recursive: true, force: true });
	});

	it("should detect json input files", async () => {
		const importPath = join(testProjectRoot, "data.json");
		writeFileSync(importPath, JSON.stringify([{ id: 1, name: "test" }], null, 2));
		const output = await captureConsole(() =>
			runIacImport(testProjectRoot, { input: importPath, dryRun: true }),
		);
		expect(output).toContain("JSON");
		expect(output).toContain(importPath);
	});

	it("should detect sql input files", async () => {
		const importPath = join(testProjectRoot, "data.sql");
		writeFileSync(importPath, "INSERT INTO users VALUES (1, 'test');");
		const output = await captureConsole(() =>
			runIacImport(testProjectRoot, { input: importPath, dryRun: true }),
		);
		expect(output).toContain("SQL");
		expect(output).toContain(importPath);
	});

	it("should respect dry-run flag", async () => {
		const importPath = join(testProjectRoot, "data.json");
		writeFileSync(importPath, JSON.stringify([{ id: 1 }], null, 2));
		const output = await captureConsole(() =>
			runIacImport(testProjectRoot, { input: importPath, dryRun: true }),
		);
		expect(output).toContain("Dry Run: Yes");
	});

	it("should default dry-run to false", async () => {
		const importPath = join(testProjectRoot, "data.json");
		writeFileSync(importPath, JSON.stringify([{ id: 1 }], null, 2));
		const output = await captureConsole(() =>
			runIacImport(testProjectRoot, { input: importPath }),
		);
		expect(output).toContain("Dry Run: No");
	});

	it("should error on missing input file", async () => {
		// runIacImport uses statSync which throws ENOENT for missing files
		await expect(
			runIacImport(testProjectRoot, { input: join(testProjectRoot, "nonexistent.json") }),
		).rejects.toThrow("ENOENT");
	});

	it("should handle table-specific imports", async () => {
		const importPath = join(testProjectRoot, "data.json");
		writeFileSync(importPath, JSON.stringify([{ id: 1 }], null, 2));
		const output = await captureConsole(() =>
			runIacImport(testProjectRoot, { input: importPath, table: "users", dryRun: true }),
		);
		expect(output).toContain("Table: users");
	});

	it("should handle complex json data structures", async () => {
		const importPath = join(testProjectRoot, "complex.json");
		const complexData = [
			{ id: 1, name: "Alice", email: "alice@example.com", createdAt: "2024-01-01T00:00:00Z", metadata: { role: "admin", active: true } },
			{ id: 2, name: "Bob", email: "bob@example.com" },
		];
		writeFileSync(importPath, JSON.stringify(complexData, null, 2));
		const output = await captureConsole(() =>
			runIacImport(testProjectRoot, { input: importPath, dryRun: true }),
		);
		expect(output).toContain("Import command initialized");
	});

	it("should accept absolute input paths", async () => {
		const absPath = join(tempDir, "external-data.json");
		writeFileSync(absPath, JSON.stringify([{ id: 1 }], null, 2));
		const output = await captureConsole(() =>
			runIacImport(testProjectRoot, { input: absPath, dryRun: true }),
		);
		expect(output).toContain(absPath);
	});

	it("should log import success after processing", async () => {
		const importPath = join(testProjectRoot, "data.json");
		writeFileSync(importPath, JSON.stringify([{ id: 1 }], null, 2));
		const output = await captureConsole(() =>
			runIacImport(testProjectRoot, { input: importPath, dryRun: true }),
		);
		expect(output).toContain("✓");
		expect(output).toContain("Import command initialized");
	});
});

describe("runMigrateFromConvex", () => {
	const testProjectRoot = join(tempDir, "convex-migration-test");

	beforeEach(() => {
		rmSync(testProjectRoot, { recursive: true, force: true });
		mkdirSync(testProjectRoot, { recursive: true });
	});

	afterEach(() => {
		rmSync(testProjectRoot, { recursive: true, force: true });
	});

	it("should convert Convex schema to BetterBase schema", async () => {
		mkdirSync(join(testProjectRoot, "convex"), { recursive: true });
		const convexSchema = `
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
  }),
  posts: defineTable({
    title: v.string(),
    author: v.id("users"),
  }),
});
`;
		writeFileSync(join(testProjectRoot, "convex", "schema.ts"), convexSchema);

		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});

		const schemaContent = readFileSync(join(testProjectRoot, "migrated", "betterbase", "schema.ts"), "utf-8");
		expect(schemaContent).toContain("@betterbase/core/iac");
		expect(schemaContent).toContain("defineSchema");
	});

	it("should convert Convex queries to BetterBase queries", async () => {
		mkdirSync(join(testProjectRoot, "convex", "queries"), { recursive: true });
		const queryFile = `
import { query } from './_generated/server';
import { v } from 'convex/values';

export const getUsers = query({
  args: { limit: v.optional(v.number()) },
  run: async (ctx, args) => {
    return ctx.db.query('users').take(args.limit ?? 10).collect();
  },
});
`;
		writeFileSync(join(testProjectRoot, "convex", "queries", "users.ts"), queryFile);

		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});

		const converted = readFileSync(join(testProjectRoot, "migrated", "betterbase", "queries", "users.ts"), "utf-8");
		expect(converted).toContain('import { query, v } from "@betterbase/core/iac"');
		expect(converted).toContain("export const getUsers = query({");
	});

	it("should convert Convex mutations to BetterBase mutations", async () => {
		mkdirSync(join(testProjectRoot, "convex", "mutations"), { recursive: true });
		const mutationFile = `
import { mutation } from './_generated/server';
import { v } from 'convex/values';

export const createUser = mutation({
  args: { name: v.string() },
  run: async (ctx, { name }) => ctx.db.insert('users', { name }),
});

export const updateUser = mutation({
  args: { id: v.id('users'), name: v.string() },
  run: async (ctx, { id, name }) => ctx.db.patch(id, { name }),
});
`;
		writeFileSync(join(testProjectRoot, "convex", "mutations", "users.ts"), mutationFile);

		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});

		const converted = readFileSync(join(testProjectRoot, "migrated", "betterbase", "mutations", "users.ts"), "utf-8");
		expect(converted).toContain('import { mutation, v } from "@betterbase/core/iac"');
		expect(converted).toContain("export const createUser = mutation({");
	});

	it("should convert Convex actions to BetterBase actions", async () => {
		mkdirSync(join(testProjectRoot, "convex", "actions"), { recursive: true });
		const actionFile = `
import { action } from './_generated/server';

export const doSomething = action({
  run: async (ctx) => {
    await ctx.runQuery(ctx.db, 'someQuery');
  },
});
`;
		writeFileSync(join(testProjectRoot, "convex", "actions", "tasks.ts"), actionFile);

		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});

		const converted = readFileSync(join(testProjectRoot, "migrated", "betterbase", "actions", "tasks.ts"), "utf-8");
		expect(converted).toContain('import { action } from "@betterbase/core/iac"');
		expect(converted).toContain("export const doSomething = action({");
	});

	it("should create proper directory structure in output", async () => {
		mkdirSync(join(testProjectRoot, "convex"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "schema.ts"), `
export default defineSchema({});
`);
		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});
		const basePath = join(testProjectRoot, "migrated", "betterbase");
		expect(statSync(join(basePath, "schema.ts")).isFile()).toBe(true);
		expect(statSync(join(basePath, "queries")).isDirectory()).toBe(true);
		expect(statSync(join(basePath, "mutations")).isDirectory()).toBe(true);
		expect(statSync(join(basePath, "actions")).isDirectory()).toBe(true);
	});

	it("should replace Convex imports with BetterBase imports in functions", async () => {
		mkdirSync(join(testProjectRoot, "convex", "queries"), { recursive: true });
		const queryFile = `
import { query } from './_generated/server';
import { v } from 'convex/values';

export const getById = query({
  args: { id: v.id('users') },
  run: async (ctx, { id }) => ctx.db.get(id),
});
`;
		writeFileSync(join(testProjectRoot, "convex", "queries", "getById.ts"), queryFile);

		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});

		const converted = readFileSync(join(testProjectRoot, "migrated", "betterbase", "queries", "getById.ts"), "utf-8");
		expect(converted).toContain('@betterbase/core/iac');
		expect(converted).not.toContain("_generated/server");
		expect(converted).not.toContain("convex/values");
	});

	it("should handle schema with no tables", async () => {
		mkdirSync(join(testProjectRoot, "convex"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "schema.ts"), `
import { defineSchema } from 'convex/server';
export default defineSchema({});
`);
		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});
		expect(readFileSync(join(testProjectRoot, "migrated", "betterbase", "schema.ts"), "utf-8")).toContain("defineSchema");
	});

	it("should generate migration report JSON file", async () => {
		mkdirSync(join(testProjectRoot, "convex"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "schema.ts"), `
export default defineSchema({});
`);
		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});
		const report = JSON.parse(
			readFileSync(join(testProjectRoot, "migrated", "betterbase", "convex-migration-report.json"), "utf-8")
		);
		expect(report).toHaveProperty("schemaConverted");
		expect(report).toHaveProperty("counts");
		expect(report).toHaveProperty("issues");
		expect(report).toHaveProperty("files");
		expect(report.counts).toHaveProperty("queries");
		expect(report.counts).toHaveProperty("mutations");
		expect(report.counts).toHaveProperty("actions");
	});

	it("should generate migration report markdown file", async () => {
		mkdirSync(join(testProjectRoot, "convex"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "schema.ts"), `
export default defineSchema({});
`);
		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});
		const reportMd = readFileSync(join(testProjectRoot, "migrated", "betterbase", "convex-migration-report.md"), "utf-8");
		expect(reportMd).toContain("# Convex Migration Compatibility Report");
		expect(reportMd).toContain("## Conversion Summary");
		expect(reportMd).toContain("## Compatibility Findings");
		expect(reportMd).toContain("## File-Level Conversion Status");
	});

	it("should detect httpAction as blocker", async () => {
		mkdirSync(join(testProjectRoot, "convex", "queries"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "queries", "blocker.ts"), `
import { httpAction } from 'convex/server';
export const api = httpAction({ handler: async () => {} });
`);
		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});
		const report = JSON.parse(
			readFileSync(join(testProjectRoot, "migrated", "betterbase", "convex-migration-report.json"), "utf-8")
		);
		const httpIssue = report.issues.find((i: any) => i.pattern.includes("httpAction"));
		expect(httpIssue).toBeDefined();
		expect(httpIssue.severity).toBe("blocker");
	});

	it("should detect cronJobs as blocker", async () => {
		mkdirSync(join(testProjectRoot, "convex", "queries"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "queries", "cron.ts"), `
import { cronJobs } from 'convex/server';
const cron = cronJobs([...]);
`);
		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});
		const report = JSON.parse(
			readFileSync(join(testProjectRoot, "migrated", "betterbase", "convex-migration-report.json"), "utf-8")
		);
		const cronIssue = report.issues.find((i: any) => i.pattern.includes("cronJobs"));
		expect(cronIssue).toBeDefined();
		expect(cronIssue.severity).toBe("blocker");
	});

	it("should throw when input directory does not exist", async () => {
		await expect(
			runMigrateFromConvex({
				inputPath: join(testProjectRoot, "nonexistent"),
				outputPath: join(testProjectRoot, "migrated"),
			}),
		).rejects.toThrow("not a directory");
	});

	it("should count converted files accurately in report", async () => {
		mkdirSync(join(testProjectRoot, "convex", "queries"), { recursive: true });
		mkdirSync(join(testProjectRoot, "convex", "mutations"), { recursive: true });
		mkdirSync(join(testProjectRoot, "convex", "actions"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "schema.ts"), `
export default defineSchema({});
`);
		writeFileSync(join(testProjectRoot, "convex", "queries", "a.ts"), `export const a = query({ run: async () => {} });`);
		writeFileSync(join(testProjectRoot, "convex", "mutations", "b.ts"), `export const b = mutation({ run: async () => {} });`);
		writeFileSync(join(testProjectRoot, "convex", "actions", "c.ts"), `export const c = action({ run: async () => {} });`);
		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});
		const report = JSON.parse(
			readFileSync(join(testProjectRoot, "migrated", "betterbase", "convex-migration-report.json"), "utf-8")
		);
		expect(report.counts.queries).toBe(1);
		expect(report.counts.mutations).toBe(1);
		expect(report.counts.actions).toBe(1);
	});

	it("should convert v.string(), v.number(), v.boolean() validators", async () => {
		const schema = `
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  products: defineTable({
    name: v.string(),
    price: v.number(),
    inStock: v.boolean(),
  }),
});
`;
		mkdirSync(join(testProjectRoot, "convex"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "schema.ts"), schema);
		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});
		const converted = readFileSync(join(testProjectRoot, "migrated", "betterbase", "schema.ts"), "utf-8");
		expect(converted).toContain("v.string()");
		expect(converted).toContain("v.number()");
		expect(converted).toContain("v.boolean()");
	});
});

describe("Integration Tests", () => {
	const testProjectRoot = join(tempDir, "iac-integration-test");

	beforeEach(() => {
		mkdirSync(join(testProjectRoot, "betterbase", "queries"), { recursive: true });
		mkdirSync(join(testProjectRoot, "betterbase", "mutations"), { recursive: true });
		mkdirSync(join(testProjectRoot, "betterbase", "actions"), { recursive: true });
	});

	afterEach(() => {
		rmSync(testProjectRoot, { recursive: true, force: true });
	});

	it("should set up test project structure", () => {
		const dirs = [
			join(testProjectRoot, "betterbase"),
			join(testProjectRoot, "betterbase", "queries"),
			join(testProjectRoot, "betterbase", "mutations"),
			join(testProjectRoot, "betterbase", "actions"),
		];
		expect(dirs.length).toBe(4);
	});

	it("should create sample query file", () => {
		const queryPath = join(testProjectRoot, "betterbase", "queries", "users.ts");
		writeFileSync(queryPath, "export const getUsers = query({});");
		const content = readFileSync(queryPath, "utf-8");
		expect(content).toContain("query");
	});

	it("should create sample mutation file", () => {
		const mutationPath = join(testProjectRoot, "betterbase", "mutations", "users.ts");
		writeFileSync(mutationPath, "export const createUser = mutation({});");
		const content = readFileSync(mutationPath, "utf-8");
		expect(content).toContain("mutation");
	});

	it("should create sample schema file", () => {
		const schemaPath = join(testProjectRoot, "betterbase", "schema.ts");
		writeFileSync(schemaPath, "export default defineSchema({});");
		const content = readFileSync(schemaPath, "utf-8");
		expect(content).toContain("defineSchema");
	});

	it("should run full analyze-export-import workflow", async () => {
		// Write queries
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "users.ts"),
			`
			export const getUsers = query({
				run: async (ctx) => ctx.db.query("users").take(50).collect(),
			});
			`,
		);
		writeFileSync(
			join(testProjectRoot, "betterbase", "queries", "posts.ts"),
			`
			export const getPosts = query({
				run: async (ctx) => {
					const users = ctx.db.query("users").take(100).collect();
					return Promise.all(users.map(u => ctx.db.query("posts").filter({ userId: u.id }).take(5).collect()));
				},
			});
			`,
		);

		// Create schema
		writeFileSync(
			join(testProjectRoot, "betterbase", "schema.ts"),
			`
			import { defineSchema, defineTable, v } from "@betterbase/core/iac";
			export default defineSchema({
			  users: defineTable({ name: v.string(), email: v.string() }),
			  posts: defineTable({ title: v.string(), userId: v.id("users") }),
			});
			`,
		);

		// Analyze using JSON output for reliable filename check
		const analyzeOutput = await captureConsole(() => runIacAnalyze(testProjectRoot, { output: "json" }));
		const analyzeResults = JSON.parse(analyzeOutput.match(/\[.*\]/s)![0]);
		const postsResult = analyzeResults.find((r: any) => r.path.includes("posts.ts"));
		expect(postsResult).toBeDefined();
		expect(postsResult.issues.some((i: string) => i.includes("N+1"))).toBe(true);

		// Export (just verify init)
		const exportOutput = await captureConsole(() =>
			runIacExport(testProjectRoot, { format: "json", output: join(testProjectRoot, "backup") }),
		);
		expect(exportOutput).toContain("Export command initialized");
		expect(exportOutput).toContain("✓");

		// Prepare import file
		const importPath = join(testProjectRoot, "backup", "users.json");
		mkdirSync(join(testProjectRoot, "backup"), { recursive: true });
		writeFileSync(importPath, JSON.stringify([{ name: "Test", email: "test@test.com" }], null, 2));

		// Import dry-run
		const importOutput = await captureConsole(() =>
			runIacImport(testProjectRoot, { input: importPath, dryRun: true }),
		);
		expect(importOutput).toContain("Dry Run: Yes");
		expect(importOutput).toContain("✓");
	});

	it("should handle Convex migration with blocker issues", async () => {
		mkdirSync(join(testProjectRoot, "convex", "queries"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "queries", "blocker.ts"), `
import { httpAction } from 'convex/server';
export const api = httpAction({ handler: async () => {} });
`);
		const output = await captureConsole(() =>
			runMigrateFromConvex({
				inputPath: join(testProjectRoot, "convex"),
				outputPath: join(testProjectRoot, "migrated"),
			}),
		);

		expect(output).toContain("Blockers:");
		expect(output).toContain("Files requiring manual review");

		const report = JSON.parse(
			readFileSync(join(testProjectRoot, "migrated", "betterbase", "convex-migration-report.json"), "utf-8")
		);
		expect(report.issues.length).toBeGreaterThan(0);
		expect(report.files.some((f: any) => f.status === "manual-review")).toBe(true);
	});

	it("should complete full Convex migration with all file types", async () => {
		mkdirSync(join(testProjectRoot, "convex"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "schema.ts"), `
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
export default defineSchema({
  users: defineTable({ name: v.string(), email: v.string() }),
  posts: defineTable({ title: v.string(), author: v.id("users") }),
});
`);
		mkdirSync(join(testProjectRoot, "convex", "queries"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "queries", "users.ts"), `
import { query } from './_generated/server';
import { v } from 'convex/values';
export const getById = query({ args: { id: v.id('users') }, run: async (ctx, { id }) => ctx.db.get(id) });
export const listAll = query({ run: async (ctx) => ctx.db.query('users').collect() });
`);
		mkdirSync(join(testProjectRoot, "convex", "mutations"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "mutations", "users.ts"), `
import { mutation } from './_generated/server';
import { v } from 'convex/values';
export const create = mutation({ args: { name: v.string() }, run: async (ctx, { name }) => ctx.db.insert('users', { name }) });
export const update = mutation({ args: { id: v.id('users'), name: v.string() }, run: async (ctx, { id, name }) => ctx.db.patch(id, { name }) });
`);
		mkdirSync(join(testProjectRoot, "convex", "actions"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "actions", "maintenance.ts"), `
import { action } from './_generated/server';
export const cleanup = action({ run: async (ctx) => { await ctx.runQuery(ctx.db, 'cleanupOldRecords'); } });
`);
		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});

		const migratedBase = join(testProjectRoot, "migrated", "betterbase");
		expect(readFileSync(join(migratedBase, "schema.ts"), "utf-8")).toContain("@betterbase/core/iac");
		expect(readFileSync(join(migratedBase, "queries", "users.ts"), "utf-8")).toContain("query");
		expect(readFileSync(join(migratedBase, "mutations", "users.ts"), "utf-8")).toContain("mutation");
		expect(readFileSync(join(migratedBase, "actions", "maintenance.ts"), "utf-8")).toContain("action");

		const report = JSON.parse(readFileSync(join(migratedBase, "convex-migration-report.json"), "utf-8"));
		expect(report.schemaConverted).toBe(true);
		// One file per kind: one queries file (users.ts with two functions), one mutations file, one actions file
		expect(report.counts.queries).toBe(1);
		expect(report.counts.mutations).toBe(1);
		expect(report.counts.actions).toBe(1);
		expect(report.files.length).toBe(3);
	});

	it("should convert edge cases: optional fields and arrays", async () => {
		mkdirSync(join(testProjectRoot, "convex"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "schema.ts"), `
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
export default defineSchema({
  products: defineTable({
    name: v.string(),
    tags: v.array(v.string()),
    optionalField: v.optional(v.number()),
  }),
});
`);
		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});
		const schema = readFileSync(join(testProjectRoot, "migrated", "betterbase", "schema.ts"), "utf-8");
		expect(schema).toContain("v.array(v.string())");
		expect(schema).toContain("v.optional(v.number())");
	});

	it("should preserve function logic during conversion", async () => {
		mkdirSync(join(testProjectRoot, "convex", "queries"), { recursive: true });
		writeFileSync(join(testProjectRoot, "convex", "queries", "complexLogic.ts"), `
import { query } from './_generated/server';
import { v } from 'convex/values';
export const calculateStats = query({
  args: { range: v.string() },
  run: async (ctx, { range }) => {
    const data = await ctx.db.query('metrics').filter({ period: range }).collect();
    const total = data.reduce((sum, d) => sum + d.value, 0);
    return { count: data.length, total };
  },
});
`);
		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});
		const converted = readFileSync(
			join(testProjectRoot, "migrated", "betterbase", "queries", "complexLogic.ts"),
			"utf-8"
		);
		expect(converted).toContain("reduce");
		expect(converted).toContain("data.length");
		expect(converted).toContain("total");
	});

	it("should not modify original Convex source files", async () => {
		mkdirSync(join(testProjectRoot, "convex", "queries"), { recursive: true });
		writeFileSync(
			join(testProjectRoot, "convex", "queries", "original.ts"),
			`
import { query } from './_generated/server';
export const f = query({ run: async () => {} });
`,
		);
		const original = readFileSync(join(testProjectRoot, "convex", "queries", "original.ts"), "utf-8");
		await runMigrateFromConvex({
			inputPath: join(testProjectRoot, "convex"),
			outputPath: join(testProjectRoot, "migrated"),
		});
		const unchanged = readFileSync(join(testProjectRoot, "convex", "queries", "original.ts"), "utf-8");
		expect(unchanged).toBe(original);
	});
});
