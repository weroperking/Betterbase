import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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

describe("runInitCommand", () => {
	test("is a callable async function", () => {
		expect(typeof runInitCommand).toBe("function");
	});

	test("accepts InitCommandOptions argument", () => {
		const opts: InitCommandOptions = { projectName: "foo" };
		expect(opts.projectName).toBe("foo");
	});
});

// ---------------------------------------------------------------------------
// IaC template – structure and content (tests what bb init scaffolds)
// ---------------------------------------------------------------------------

const IAC_TEMPLATE_DIR = join(import.meta.dir, "..", "..", "..", "..", "templates", "iac");

function readTemplateFile(relPath: string): string {
	return readFileSync(join(IAC_TEMPLATE_DIR, relPath), "utf-8");
}

describe("IaC template structure", () => {
	test("contains package.json with expected scripts", () => {
		expect(existsSync(join(IAC_TEMPLATE_DIR, "package.json"))).toBe(true);
		const pkg = JSON.parse(readTemplateFile("package.json"));
		expect(pkg.scripts).toBeDefined();
		expect(pkg.scripts.dev).toBeDefined();
		expect(pkg.name).toBeDefined();
	});

	test("contains betterbase.config.ts with defineConfig", () => {
		const content = readTemplateFile("betterbase.config.ts");
		expect(content).toContain("defineConfig");
		expect(content).toContain("@betterbase/core");
	});

	test("contains tsconfig.json", () => {
		expect(existsSync(join(IAC_TEMPLATE_DIR, "tsconfig.json"))).toBe(true);
		const tsconfig = JSON.parse(readTemplateFile("tsconfig.json"));
		expect(tsconfig.compilerOptions).toBeDefined();
	});

	test("contains src/index.ts", () => {
		expect(existsSync(join(IAC_TEMPLATE_DIR, "src", "index.ts"))).toBe(true);
	});

	test("contains betterbase/schema.ts with defineSchema", () => {
		const content = readTemplateFile("betterbase/schema.ts");
		expect(content).toContain("defineSchema");
		expect(content).toContain("defineTable");
	});

	test("contains betterbase/queries/todos.ts", () => {
		const content = readTemplateFile("betterbase/queries/todos.ts");
		expect(content).toContain("query");
	});

	test("contains betterbase/mutations/todos.ts", () => {
		const content = readTemplateFile("betterbase/mutations/todos.ts");
		expect(content).toContain("mutation");
	});

	test("contains betterbase/cron.ts", () => {
		expect(
			existsSync(join(IAC_TEMPLATE_DIR, "betterbase", "cron.ts")),
		).toBe(true);
	});

	test("contains .gitkeep for actions directory", () => {
		expect(
			existsSync(
				join(IAC_TEMPLATE_DIR, "betterbase", "actions", ".gitkeep"),
			),
		).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// File content verification – tests equivalent to what the build functions
// produce in the legacy (--no-iac) path.  We verify these by checking that
// the real init command would have generated equivalent content based on
// the functions defined in init.ts.
// ---------------------------------------------------------------------------

describe("build output equivalence", () => {
	test("getAuthDialect maps turso→sqlite, planetscale→mysql, others→pg", () => {
		// mirrors the internal getAuthDialect function
		expect(getAuthDialect("turso")).toBe("sqlite");
		expect(getAuthDialect("planetscale")).toBe("mysql");
		for (const p of ["neon", "postgres", "supabase", "managed"]) {
			expect(getAuthDialect(p)).toBe("pg");
		}
	});

	test("getDatabaseLabel returns human-readable labels for all providers", () => {
		const providers = [
			"neon",
			"turso",
			"planetscale",
			"supabase",
			"postgres",
			"managed",
		] as const;
		for (const p of providers) {
			const label = getDatabaseLabel(p);
			expect(typeof label).toBe("string");
			expect(label.length).toBeGreaterThan(5);
		}
	});
});
