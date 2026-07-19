import { describe, expect, it, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { type InitCommandOptions, runInitCommand } from "../../src/commands/init";

// ---------------------------------------------------------------------------
// Replicated schemas / helpers from init.ts (NOT exported — replicated here
// identically so we can validate the same logic the real init command uses)
// ---------------------------------------------------------------------------

const projectNameSchema = z
	.string()
	.trim()
	.min(1)
	.regex(
		/^[a-zA-Z0-9-_]+$/,
		"Project name can only contain letters, numbers, hyphens, and underscores.",
	);

const initOptionsSchema = z.object({
	projectName: projectNameSchema.optional(),
});

// ---------------------------------------------------------------------------
// projectNameSchema
// ---------------------------------------------------------------------------

describe("projectNameSchema", () => {
	test("accepts valid names (alphanumeric, hyphens, underscores)", () => {
		expect(() => projectNameSchema.parse("my-project")).not.toThrow();
		expect(() => projectNameSchema.parse("MyApp")).not.toThrow();
		expect(() => projectNameSchema.parse("my_app")).not.toThrow();
		expect(() => projectNameSchema.parse("foo123")).not.toThrow();
		expect(() => projectNameSchema.parse("A")).not.toThrow();
		expect(() => projectNameSchema.parse("my-betterbase-app")).not.toThrow();
	});

	test("rejects empty strings", () => {
		expect(() => projectNameSchema.parse("")).toThrow();
		expect(() => projectNameSchema.parse("   ")).toThrow();
	});

	test("rejects names with special characters (spaces, @, !, etc.)", () => {
		expect(() => projectNameSchema.parse("my app")).toThrow();
		expect(() => projectNameSchema.parse("my@app")).toThrow();
		expect(() => projectNameSchema.parse("hello!")).toThrow();
		expect(() => projectNameSchema.parse("test/app")).toThrow();
		expect(() => projectNameSchema.parse("name.with.dots")).toThrow();
	});

	test("trims whitespace before validation", () => {
		expect(() => projectNameSchema.parse("  my-app  ")).not.toThrow();
		expect(projectNameSchema.parse("  my-app  ")).toBe("my-app");
	});
});

// ---------------------------------------------------------------------------
// initOptionsSchema
// ---------------------------------------------------------------------------

describe("initOptionsSchema", () => {
	test("accepts empty object", () => {
		expect(() => initOptionsSchema.parse({})).not.toThrow();
	});

	test("accepts object with valid projectName", () => {
		expect(() =>
			initOptionsSchema.parse({ projectName: "my-app" }),
		).not.toThrow();
	});

	test("rejects object with invalid projectName", () => {
		expect(() =>
			initOptionsSchema.parse({ projectName: "bad name!" }),
		).toThrow();
	});
});

 // ---------------------------------------------------------------------------
 // InitCommandOptions type
// ---------------------------------------------------------------------------

describe("InitCommandOptions", () => {
	test("allows empty object", () => {
		const opts: InitCommandOptions = {};
		expect(opts).toBeDefined();
	});

	test("allows projectName string", () => {
		const opts: InitCommandOptions = { projectName: "my-app" };
		expect(opts.projectName).toBe("my-app");
	});

	test("validation rejects invalid projectName via initOptionsSchema", () => {
		const result = initOptionsSchema.safeParse({
			projectName: "bad name with spaces!",
		});
		expect(result.success).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// runInitCommand — importable and callable
// ---------------------------------------------------------------------------

describe("runInitCommand (IaC integration)", () => {
	it("copies full IaC template into new project directory", async () => {
		const projectName = `bb-test-${randomUUID().slice(0, 8)}`;
		// Create a temporary parent directory in OS temp dir
		const parentDir = join(tmpdir(), `tmp-integration-parent-${randomUUID().slice(0, 8)}`);
		await mkdir(parentDir, { recursive: true });
		const projectPath = join(parentDir, projectName);

		// Clean start
		try {
			await rm(projectPath, { recursive: true, force: true });
		} catch {
			/* ignore */
		}

		// Switch to parent directory so that runInitCommand creates project there
		const origCwd = process.cwd();
		process.chdir(parentDir);
		try {
			await runInitCommand({ projectName });

			// Expected files from templates/iac plus generated .env/.gitignore
			expect(existsSync(join(projectPath, "package.json"))).toBe(true);
			expect(existsSync(join(projectPath, "tsconfig.json"))).toBe(true);
			expect(existsSync(join(projectPath, ".env"))).toBe(true);
			expect(existsSync(join(projectPath, ".env.example"))).toBe(true);
			expect(existsSync(join(projectPath, ".gitignore"))).toBe(true);
			expect(existsSync(join(projectPath, "AGENTS.md"))).toBe(true);
			expect(existsSync(join(projectPath, "betterbase.config.ts"))).toBe(true);
			expect(existsSync(join(projectPath, "betterbase", "schema.ts"))).toBe(true);
			expect(existsSync(join(projectPath, "betterbase", "queries", "todos.ts"))).toBe(true);
			expect(existsSync(join(projectPath, "betterbase", "mutations", "todos.ts"))).toBe(true);
			expect(existsSync(join(projectPath, "betterbase", "cron.ts"))).toBe(true);
			expect(existsSync(join(projectPath, "betterbase", "actions", ".gitkeep"))).toBe(true);
			expect(existsSync(join(projectPath, "src", "index.ts"))).toBe(true);
			expect(existsSync(join(projectPath, "src", "modules", "README.md"))).toBe(true);
			expect(existsSync(join(projectPath, "src", "modules", ".gitkeep"))).toBe(true);

			// Spot-check contents
			const pkg = JSON.parse(readFileSync(join(projectPath, "package.json"), "utf-8"));
			expect(pkg.name).toBe(projectName);
			expect(pkg.scripts.dev).toContain("bb dev");

			const bbConfig = readFileSync(join(projectPath, "betterbase.config.ts"), "utf-8");
			expect(bbConfig).toContain("defineConfig");

			const bbSchema = readFileSync(join(projectPath, "betterbase", "schema.ts"), "utf-8");
			expect(bbSchema).toContain("defineSchema");

			const env = readFileSync(join(projectPath, ".env"), "utf-8");
			expect(env).toContain("DATABASE_URL");

			const agentsMd = readFileSync(join(projectPath, "AGENTS.md"), "utf-8");
			expect(agentsMd).toContain("BetterBase IaC Operational Constraints");
			expect(agentsMd).toContain(`Project: ${projectName}`);
			expect(agentsMd).toContain("## ALLOWED Operations");
			expect(agentsMd).toContain("## PROHIBITED Operations");
		} finally {
			process.chdir(origCwd);
			await rm(projectPath, { recursive: true, force: true });
			await rm(parentDir, { recursive: true, force: true });
		}
	});
});
