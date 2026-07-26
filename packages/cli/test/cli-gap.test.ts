/**
 * CLI Gap Implementation Tests
 *
 * Covers the 8 tasks from
 * `.kilo/plans/1784896802268-cli-gap-implementation.md`:
 *
 *   1. configure audit trail (timestamped .bak + .bb-configure-log.json)
 *   2. --dry-run on configure + deps install
 *   3. iac diff fallback to compiled .js (works from bundled dist)
 *   4. configure rollback (subcommand, --to, --list)
 *   5. post-change validation (uses BetterBaseConfigSchema + env checks)
 *   6. deps install robustness (Bun.spawn, lockfile check, --check)
 *   7. init.ts syntax — covered by existing init.test.ts (no new fixture needed)
 *   8. --json output on configure + iac diff
 *
 * Conventions mirror packages/cli/test/iac-commands.test.ts and
 * smoke.test.ts — tmpdir project roots, sync `mkdirSync`/`writeFileSync`/
 * `rmSync`, and a local `captureConsole` helper that swaps
 * console.log / console.error.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import { join } from "node:path";

import {
	runConfigureCommand,
	runRollbackCommand,
} from "../src/commands/configure";
import { runDepsInstallCommand } from "../src/commands/deps";
import { runIacDiff } from "../src/commands/iac/diff";

const tempRoot = join(os.tmpdir(), "bb-cli-gap-test");

async function captureConsole(fn: () => Promise<void>): Promise<string> {
	const originalLog = console.log;
	const originalError = console.error;
	const originalWarn = console.warn;
	const output: string[] = [];
	const push = (...args: unknown[]) =>
		output.push(
			args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
		);
	console.log = push;
	console.error = push;
	console.warn = push;
	try {
		await fn();
		return output.join("\n");
	} finally {
		console.log = originalLog;
		console.error = originalError;
		console.warn = originalWarn;
	}
}

/** Write a `betterbase.config.ts` that passes `BetterBaseConfigSchema`. */
function writeValidConfig(
	projectRoot: string,
	opts: {
		type?: "postgres" | "neon" | "supabase" | "planetscale" | "turso" | "managed";
		connectionString?: string;
		url?: string;
		authToken?: string;
	} = {},
): void {
	const type = opts.type ?? "postgres";
	const lines: string[] = [];
	lines.push("export default defineConfig({");
	lines.push("\tproject: {");
	lines.push(`\t\tname: "test-project",`);
	lines.push("\t},");
	lines.push("\tprovider: {");
	lines.push(`\t\ttype: "${type}",`);
	if (type === "turso") {
		lines.push(`\t\turl: process.env.TURSO_URL ?? "${opts.url ?? ""}",`);
		lines.push(`\t\tauthToken: process.env.TURSO_AUTH_TOKEN ?? "${opts.authToken ?? ""}",`);
	} else if (type !== "managed") {
		lines.push(
			`\t\tconnectionString: process.env.DATABASE_URL ?? "${
				opts.connectionString ?? "postgres://user:pass@localhost:5432/test"
			}",`,
		);
	}
	lines.push("\t},");
	lines.push("});");
	mkdirSync(projectRoot, { recursive: true });
	writeFileSync(join(projectRoot, "betterbase.config.ts"), lines.join("\n"));
}

/** Write a `.env` file with key=value pairs. */
function writeEnv(projectRoot: string, vars: Record<string, string>): void {
	const lines = Object.entries(vars).map(([k, v]) => `${k}=${v}`);
	writeFileSync(join(projectRoot, ".env"), lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// Task 1 — configure audit trail
// ---------------------------------------------------------------------------

describe("CLI gap implementation — configure audit trail (Task 1)", () => {
	const root = join(tempRoot, "audit");
	beforeEach(() => rmSync(root, { recursive: true, force: true }));
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it("creates a timestamped .bak copy under betterbase/.backups/ before mutation", async () => {
		writeValidConfig(root, { type: "postgres" });
		await captureConsole(() =>
			runConfigureCommand({ projectRoot: root, provider: "turso" }),
		);

		const backupDir = join(root, "betterbase", ".backups");
		expect(existsSync(backupDir)).toBe(true);
		const backupFiles = readdirSync(backupDir);
		const configBackups = backupFiles.filter((f) => f.startsWith("betterbase.config.ts.bak."));
		expect(configBackups.length).toBe(1);
		// Timestamp suffix format: YYYYMMDDHHMMSS (14 digits)
		expect(configBackups[0]).toMatch(/betterbase\.config\.ts\.bak\.\d{14}$/);

		// Backed-up content is the pre-mutation value (`postgres`), not the post-mutation `turso`
		const backedUp = readFileSync(join(backupDir, configBackups[0]), "utf-8");
		expect(backedUp).toContain(`"postgres"`);
		expect(backedUp).not.toContain(`"turso"`);
	});

	it("appends an entry to betterbase/.bb-configure-log.json for every change", async () => {
		writeValidConfig(root, { type: "postgres" });
		await captureConsole(() =>
			runConfigureCommand({ projectRoot: root, provider: "turso" }),
		);

		const logPath = join(root, "betterbase", ".bb-configure-log.json");
		expect(existsSync(logPath)).toBe(true);
		const log = JSON.parse(readFileSync(logPath, "utf-8")) as Array<{
			timestamp: string;
			action: string;
			key: string;
			oldValue: string;
			newValue: string;
			file: string;
		}>;
		expect(Array.isArray(log)).toBe(true);
		expect(log.length).toBe(1);
		expect(log[0].action).toBe("update");
		expect(log[0].key).toBe("type");
		expect(log[0].oldValue).toMatch(/postgres/);
		expect(log[0].newValue).toMatch(/turso/);
		expect(log[0].file).toBe("betterbase.config.ts");
		expect(typeof log[0].timestamp).toBe("string");
	});
});

// ---------------------------------------------------------------------------
// Task 2 — --dry-run on configure + deps install
// ---------------------------------------------------------------------------

describe("CLI gap — --dry-run (Task 2)", () => {
	const root = join(tempRoot, "dry-run");
	beforeEach(() => rmSync(root, { recursive: true, force: true }));
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it("configure --dry-run prints diff-style preview but writes no files", async () => {
		writeValidConfig(root, { type: "postgres" });

		const before = readFileSync(join(root, "betterbase.config.ts"), "utf-8");
		const output = await captureConsole(() =>
			runConfigureCommand({ projectRoot: root, provider: "turso", dryRun: true }),
		);

		const after = readFileSync(join(root, "betterbase.config.ts"), "utf-8");
		expect(after).toBe(before); // file untouched

		// No backup, no log
		expect(existsSync(join(root, "betterbase", ".backups"))).toBe(false);
		expect(existsSync(join(root, "betterbase", ".bb-configure-log.json"))).toBe(false);

		// Output announces dry-run and shows old -> new
		expect(output).toMatch(/dry-run/i);
		expect(output).toContain("postgres");
		expect(output).toContain("turso");
	});

	it("deps install --dry-run reports would-change deps without writing package.json", async () => {
		mkdirSync(root, { recursive: true });
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ name: "test", dependencies: {} }) + "\n",
		);

		const before = readFileSync(join(root, "package.json"), "utf-8");
		const output = await captureConsole(() =>
			runDepsInstallCommand({ projectRoot: root, dryRun: true }),
		);
		const after = readFileSync(join(root, "package.json"), "utf-8");

		// Without a bun.lockb around, real install is skipped — even with --dry-run off.
		// The contract for --dry-run here is "no file mutation": package.json is byte-identical.
		expect(after).toBe(before);
		expect(output).toMatch(/dry-run/i);
		expect(output).toContain("Would change");
	});
});

// ---------------------------------------------------------------------------
// Task 4 — configure rollback
// ---------------------------------------------------------------------------

describe("CLI gap — configure rollback (Task 4)", () => {
	const root = join(tempRoot, "rollback");
	beforeEach(() => rmSync(root, { recursive: true, force: true }));
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	async function setupTwoBackups(): Promise<{ older: string; newer: string }> {
		writeValidConfig(root, { type: "postgres" });
		// First mutation → backup #1
		await captureConsole(() =>
			runConfigureCommand({ projectRoot: root, provider: "neon" }),
		);
		const olderBackup = readdirSync(join(root, "betterbase", ".backups")).find((f) =>
			f.startsWith("betterbase.config.ts.bak."),
		)!;

		// Sleep so the next timestamp differs (timestamps are second-resolution).
		await new Promise((r) => setTimeout(r, 1100));
		// Second mutation → backup #2 with the file in `neon` state
		await captureConsole(() =>
			runConfigureCommand({ projectRoot: root, provider: "turso" }),
		);
		const newerBackup = readdirSync(join(root, "betterbase", ".backups"))
			.filter((f) => f.startsWith("betterbase.config.ts.bak."))
			.sort()
			.pop()!;

		return { older: olderBackup, newer: newerBackup };
	}

	it("rollback without options restores the newest backup (which contains pre-mutation value)", async () => {
		const { newer } = await setupTwoBackups();
		const olderContentOnDisk = readFileSync(
			join(root, "betterbase", ".backups", newer),
			"utf-8",
		);
		await captureConsole(() => runRollbackCommand(root, {}));

		const restored = readFileSync(join(root, "betterbase.config.ts"), "utf-8");
		expect(restored).toBe(olderContentOnDisk);
	});

	it("rollback --to <timestamp> restores a specific backup", async () => {
		const { older } = await setupTwoBackups();
		const timestamp = older.replace("betterbase.config.ts.bak.", "");
		const targetContent = readFileSync(
			join(root, "betterbase", ".backups", older),
			"utf-8",
		);

		await captureConsole(() => runRollbackCommand(root, { to: timestamp }));

		const restored = readFileSync(join(root, "betterbase.config.ts"), "utf-8");
		expect(restored).toBe(targetContent);
	});

	it("rollback --list prints available backups without mutating config", async () => {
		await setupTwoBackups();
		const before = readFileSync(join(root, "betterbase.config.ts"), "utf-8");
		const output = await captureConsole(() => runRollbackCommand(root, { list: true }));
		const after = readFileSync(join(root, "betterbase.config.ts"), "utf-8");

		expect(before).toBe(after);
		// Both timestamp-suffix backups are mentioned (newest first ordering assumed)
		expect(output).toMatch(/Found \d+ backup/);
		expect(output).toMatch(/\d{14}/);
	});
});

// ---------------------------------------------------------------------------
// Task 5 — post-change validation
// ---------------------------------------------------------------------------

describe("CLI gap — post-change validation (Task 5)", () => {
	const root = join(tempRoot, "validation");
	beforeEach(() => rmSync(root, { recursive: true, force: true }));
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it("surfaces validation failure and rollback hint for Turso with missing TURSO_URL/TURSO_AUTH_TOKEN", async () => {
		// Start with a clean postgres project (no .env). Switching to Turso turns
		// the post-mutation config into one the schema + env-var validator will
		// reject (TURSO_URL+TURSO_AUTH_TOKEN missing), but `runConfigureCommand`
		// returns gracefully (no process.exit) so this is safely testable.
		writeValidConfig(root, { type: "postgres" });
		const output = await captureConsole(() =>
			runConfigureCommand({ projectRoot: root, provider: "turso" }),
		);
		expect(output).toContain("Configuration validation failed");
		expect(output).toContain("TURSO_URL");
		expect(output).toContain("TURSO_AUTH_TOKEN");
		expect(output).toContain("bb configure rollback");
	});

	it("does not warn on rollback when validation passes (valid postgres + DATABASE_URL)", async () => {
		writeValidConfig(root, { type: "postgres" });
		writeEnv(root, { DATABASE_URL: "postgres://u:p@localhost:5432/db" });
		const output = await captureConsole(() =>
			runConfigureCommand({ projectRoot: root, port: 4001 }),
		);
		expect(output).not.toContain("Configuration validation failed");
		expect(output).toContain("Configuration updated");
	});

	it("--json mode surfaces validation errors as a structured 'errors' field (Task 5 + 8)", async () => {
		writeValidConfig(root, { type: "postgres" });
		const output = await captureConsole(() =>
			runConfigureCommand({ projectRoot: root, provider: "turso", json: true }),
		);

		const parsed = JSON.parse(output) as {
			errors: string[];
			changes: Array<{ file: string; key: string }>;
		};
		expect(parsed.errors.length).toBeGreaterThan(0);
		expect(parsed.errors.some((e) => e.includes("TURSO_URL"))).toBe(true);
		expect(parsed.errors.some((e) => e.includes("TURSO_AUTH_TOKEN"))).toBe(true);
		expect(parsed.changes.some((c) => c.key === "type")).toBe(true);
	});

	it("--json + --dry-run returns a JSON changes array (shape contract)", async () => {
		writeValidConfig(root, { type: "postgres" });
		writeEnv(root, { DATABASE_URL: "postgres://u:p@localhost:5432/db" });
		const output = await captureConsole(() =>
			runConfigureCommand({
				projectRoot: root,
				provider: "turso",
				dryRun: true,
				json: true,
			}),
		);

		const parsed = JSON.parse(output) as unknown;
		expect(Array.isArray(parsed)).toBe(true);
		// File unchanged after dry-run
		const after = readFileSync(join(root, "betterbase.config.ts"), "utf-8");
		expect(after).toMatch(/type:\s*"postgres"/);
	});

	it("--json + --dry-run surfaces validation errors when pre-mutation config is invalid", async () => {
		// Hand-write a Turso config with NO url/authToken lines so the on-disk
		// file the validator reads (dry-run does not mutate configContent)
		// actually trips the schema's superRefine AND the env-var validator.
		mkdirSync(root, { recursive: true });
		writeFileSync(
			join(root, "betterbase.config.ts"),
			`export default defineConfig({\n\tproject: { name: "broken-turso" },\n\tprovider: { type: "turso" },\n});\n`,
		);
		// Use --provider (which always emits a Change) rather than --port —
		// the port branch silently no-ops if no .env exists and the early
		// "no changes" return path would emit `[]` instead of `{ errors, changes }`.
		const output = await captureConsole(() =>
			runConfigureCommand({
				projectRoot: root,
				provider: "managed",
				dryRun: true,
				json: true,
			}),
		);

		const parsed = JSON.parse(output) as { errors?: string[]; changes?: unknown[] };
		expect(Array.isArray(parsed.errors)).toBe(true);
		expect((parsed.errors ?? []).length).toBeGreaterThan(0);
		expect(parsed.errors!.some((e) => /TURSO_URL|TURSO_AUTH_TOKEN|url|authToken/i.test(e))).toBe(
			true,
		);
	});

	it("autoRegister flag is recorded in the audit trail (Commander normalization + manual-call spelling)", async () => {
		// Use a config that already passes validation so the run actually reaches
		// the audit-log writing phase (the pre-existing bug in `updateConfigValue`
		// — it can only update existing keys, not insert new ones — is left as
		// a documented follow-up; this test asserts the audit lane is wired up).
		writeValidConfig(root, { type: "postgres" });
		writeEnv(root, { DATABASE_URL: "postgres://u:p@localhost:5432/db" });

		await captureConsole(() =>
			runConfigureCommand({ projectRoot: root, autoRegister: true }),
		);
		const log = JSON.parse(
			readFileSync(join(root, "betterbase", ".bb-configure-log.json"), "utf-8"),
		) as Array<{ key: string; newValue: string }>;
		expect(log.some((e) => e.key === "autoRegister" && /true/.test(e.newValue))).toBe(
			true,
		);

		// And the kebab key spelling is also accepted by the schema.
		await captureConsole(() =>
			runConfigureCommand({
				projectRoot: root,
				"auto-register": true,
				port: 4003,
			}),
		);
		const log2 = JSON.parse(
			readFileSync(join(root, "betterbase", ".bb-configure-log.json"), "utf-8"),
		) as Array<{ key: string; newValue: string; oldValue: string }>;
		const autoEntries = log2.filter((e) => e.key === "autoRegister");
		expect(autoEntries.length).toBeGreaterThanOrEqual(2);
	});
});

// ---------------------------------------------------------------------------
// Task 6 — deps install robustness
// ---------------------------------------------------------------------------

describe("CLI gap — deps robustness (Task 6)", () => {
	const root = join(tempRoot, "deps-robust");
	beforeEach(() => rmSync(root, { recursive: true, force: true }));
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it("--check reports MISSING when bun.lockb is absent (no install attempt)", async () => {
		mkdirSync(root, { recursive: true });
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ name: "p", dependencies: {} }) + "\n",
		);

		const output = await captureConsole(() =>
			runDepsInstallCommand({ projectRoot: root, check: true }),
		);
		expect(output).toContain("bun.lockb: MISSING");
		// Suggestion to run `bun init` is part of the contract
		expect(output).toMatch(/bun init/);
	});

	it("--check reports lockfile present when bun.lockb exists", async () => {
		mkdirSync(root, { recursive: true });
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ name: "p", dependencies: {} }) + "\n",
		);
		// Touch an empty bun.lockb as a fingerprint for the existence check.
		writeFileSync(join(root, "bun.lockb"), "");

		const output = await captureConsole(() =>
			runDepsInstallCommand({ projectRoot: root, check: true }),
		);
		expect(output).toContain("bun.lockb: present");
	});

	it("skips bun install with a warning when bun.lockb is absent", async () => {
		mkdirSync(root, { recursive: true });
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				name: "p",
				dependencies: { "@betterbase/core": "0.0.0-old" },
			}) + "\n",
		);

		const output = await captureConsole(() =>
			runDepsInstallCommand({ projectRoot: root }),
		);
		// Without a lockfile, bun install must not be invoked.
		expect(output).toMatch(/No bun\.lockb.*Skipping bun install/);
	});
});

// ---------------------------------------------------------------------------
// Task 3 + Task 8 — iac diff fallback + --json output
// ---------------------------------------------------------------------------

describe("CLI gap — iac diff (Tasks 3 + 8)", () => {
	const root = join(tempRoot, "iac-diff-fallback");
	beforeEach(() => rmSync(root, { recursive: true, force: true }));
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	function writeCompiledSchema(projectRoot: string, tables: string[]): void {
		const betterbaseDir = join(projectRoot, "betterbase", "_generated");
		mkdirSync(betterbaseDir, { recursive: true });
		// A minimal, valid `defineSchema(...)` export that the dist can `import()`.
		// The default schema shape used here matches what runIacSync produces.
		const tableEntries = tables
			.map((t) => `\t${t}: defineTable({ name: v.string() })`)
			.join(",\n");
		writeFileSync(
			join(betterbaseDir, "schema.compiled.js"),
			`import { defineSchema, defineTable, v } from "@betterbase/core/iac";\n` +
				`export default defineSchema({\n${tableEntries}\n});\n`,
		);
	}

	it("loads from _generated/schema.compiled.js (Task 3 — bundled-dist path)", async () => {
		writeCompiledSchema(root, ["users"]);
		mkdirSync(join(root, "betterbase"), { recursive: true });
		const output = await captureConsole(() => runIacDiff(root, { json: true }));
		const json = JSON.parse(output.trim());
		expect(json.isEmpty).toBe(true);
		expect(Array.isArray(json.changes)).toBe(true);
	});

	it("--json emits structured output with isEmpty/hasDestructive/changes", async () => {
		writeCompiledSchema(root, ["users"]);
		const output = await captureConsole(() => runIacDiff(root, { json: true }));
		const json = JSON.parse(output.trim());
		expect(typeof json.isEmpty).toBe("boolean");
		expect(typeof json.hasDestructive).toBe("boolean");
		expect(Array.isArray(json.changes)).toBe(true);
		// Each change (if present) must expose type/table/destructive
		for (const c of json.changes as Array<{ type: string; destructive: boolean }>) {
			expect(typeof c.type).toBe("string");
			expect(typeof c.destructive).toBe("boolean");
		}
	});
});
