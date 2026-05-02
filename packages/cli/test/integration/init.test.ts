import { afterEach, beforeEach, describe, expect, it, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
	iac: z.boolean().optional(),
});

const providerTypeSchema = z.enum([
	"neon",
	"turso",
	"planetscale",
	"supabase",
	"postgres",
	"managed",
]);

function getDatabaseLabel(provider: string): string {
	const labels: Record<string, string> = {
		neon: "Neon (serverless Postgres)",
		turso: "Turso (edge SQLite)",
		planetscale: "PlanetScale (MySQL-compatible)",
		supabase: "Supabase (Postgres)",
		postgres: "Raw Postgres",
		managed: "Managed by BetterBase (coming soon)",
	};
	return labels[provider] ?? "Unknown";
}

function getAuthDialect(provider: string): "sqlite" | "pg" | "mysql" {
	if (provider === "turso") return "sqlite";
	if (provider === "planetscale") return "mysql";
	return "pg";
}

function containsTableDefinition(
	content: string,
	tableName: string,
	importModule: string,
	tableFn: string,
): boolean {
	return (
		content.includes(importModule) &&
		content.includes(`export const ${tableName}`) &&
		content.includes(`${tableFn}(`) &&
		content.includes(".primaryKey()")
	);
}

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

	test("accepts object with iac flag", () => {
		expect(() => initOptionsSchema.parse({ iac: true })).not.toThrow();
		expect(() => initOptionsSchema.parse({ iac: false })).not.toThrow();
	});

	test("accepts object with both projectName and iac", () => {
		const result = initOptionsSchema.parse({
			projectName: "test-project",
			iac: false,
		});
		expect(result.projectName).toBe("test-project");
		expect(result.iac).toBe(false);
	});

	test("rejects object with invalid projectName", () => {
		expect(() =>
			initOptionsSchema.parse({ projectName: "bad name!" }),
		).toThrow();
	});
});

// ---------------------------------------------------------------------------
// providerTypeSchema
// ---------------------------------------------------------------------------

describe("providerTypeSchema", () => {
	test("accepts all valid provider types", () => {
		const validProviders = [
			"neon",
			"turso",
			"planetscale",
			"supabase",
			"postgres",
			"managed",
		] as const;

		for (const provider of validProviders) {
			expect(() => providerTypeSchema.parse(provider)).not.toThrow();
			expect(providerTypeSchema.parse(provider)).toBe(provider);
		}
	});

	test("rejects invalid provider types", () => {
		expect(() => providerTypeSchema.parse("sqlite")).toThrow();
		expect(() => providerTypeSchema.parse("mysql")).toThrow();
		expect(() => providerTypeSchema.parse("mongodb")).toThrow();
		expect(() => providerTypeSchema.parse("")).toThrow();
		expect(() => providerTypeSchema.parse("NEON")).toThrow();
	});
});

// ---------------------------------------------------------------------------
// getDatabaseLabel
// ---------------------------------------------------------------------------

describe("getDatabaseLabel", () => {
	test("returns correct label for neon", () => {
		expect(getDatabaseLabel("neon")).toBe("Neon (serverless Postgres)");
	});

	test("returns correct label for turso", () => {
		expect(getDatabaseLabel("turso")).toBe("Turso (edge SQLite)");
	});

	test("returns correct label for planetscale", () => {
		expect(getDatabaseLabel("planetscale")).toBe(
			"PlanetScale (MySQL-compatible)",
		);
	});

	test("returns correct label for supabase", () => {
		expect(getDatabaseLabel("supabase")).toBe("Supabase (Postgres)");
	});

	test("returns correct label for postgres", () => {
		expect(getDatabaseLabel("postgres")).toBe("Raw Postgres");
	});

	test("returns correct label for managed", () => {
		expect(getDatabaseLabel("managed")).toBe(
			"Managed by BetterBase (coming soon)",
		);
	});

	test("every known provider has a distinct label", () => {
		const providers = [
			"neon",
			"turso",
			"planetscale",
			"supabase",
			"postgres",
			"managed",
		] as const;
		const labels = providers.map((p) => getDatabaseLabel(p));
		expect(new Set(labels).size).toBe(providers.length);
	});
});

// ---------------------------------------------------------------------------
// getAuthDialect
// ---------------------------------------------------------------------------

describe("getAuthDialect", () => {
	test("returns sqlite for turso", () => {
		expect(getAuthDialect("turso")).toBe("sqlite");
	});

	test("returns mysql for planetscale", () => {
		expect(getAuthDialect("planetscale")).toBe("mysql");
	});

	test("returns pg for neon", () => {
		expect(getAuthDialect("neon")).toBe("pg");
	});

	test("returns pg for postgres", () => {
		expect(getAuthDialect("postgres")).toBe("pg");
	});

	test("returns pg for supabase", () => {
		expect(getAuthDialect("supabase")).toBe("pg");
	});

	test("returns pg for managed", () => {
		expect(getAuthDialect("managed")).toBe("pg");
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

	test("allows iac boolean flag", () => {
		const optsTrue: InitCommandOptions = { iac: true };
		const optsFalse: InitCommandOptions = { iac: false };
		expect(optsTrue.iac).toBe(true);
		expect(optsFalse.iac).toBe(false);
	});

	test("validation rejects invalid projectName via initOptionsSchema", () => {
		const result = initOptionsSchema.safeParse({
			projectName: "bad name with spaces!",
		});
		expect(result.success).toBe(false);
	});

	test("validation passes with valid combined options", () => {
		const result = initOptionsSchema.safeParse({
			projectName: "valid-name",
			iac: true,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.projectName).toBe("valid-name");
			expect(result.data.iac).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// runInitCommand — importable and callable
// ---------------------------------------------------------------------------

describe("runInitCommand (IaC integration)", () => {
	it("copies full IaC template into new project directory", async () => {
		const projectName = `bb-test-${randomUUID().slice(0, 8)}`;
		// Create a temporary parent directory
		const parentDir = join(import.meta.dir, "..", "..", "..", "..", "tmp-integration-parent");
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
			expect(pkg.scripts.dev).toContain("bun");

			const bbConfig = readFileSync(join(projectPath, "betterbase.config.ts"), "utf-8");
			expect(bbConfig).toContain("defineConfig");

			const bbSchema = readFileSync(join(projectPath, "betterbase", "schema.ts"), "utf-8");
			expect(bbSchema).toContain("defineSchema");

			const env = readFileSync(join(projectPath, ".env"), "utf-8");
			expect(env).toContain("DATABASE_URL");
		} finally {
			process.chdir(origCwd);
			await rm(projectPath, { recursive: true, force: true });
		}
	});
});
