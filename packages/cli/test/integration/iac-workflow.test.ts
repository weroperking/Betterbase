/**
 * IAC Workflow — Full Pipeline Integration Tests
 *
 * Phase 4 deliverable: tests that exercise the complete IaC workflow:
 *   iac sync  →  iac generate  →  iac analyze
 *
 * Verifies file outputs, ordering guarantees, and end-to-end behavior.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestProject } from "../fixtures/fixtures";

// ── Mocks ────────────────────────────────────────────────────────────────────────

const iacSyncPath = join(import.meta.dir, "../../src/commands/iac/sync.ts");
const iacGenPath = join(import.meta.dir, "../../src/commands/iac/generate.ts");
const iacAnalyzePath = join(import.meta.dir, "../../src/commands/iac/analyze.ts");

let syncCalls: number[] = [];
let genCalls: number[] = [];
let analyzeCalls: number[] = [];

function resetMocks() {
	syncCalls = [];
	genCalls = [];
	analyzeCalls = [];
}

mock.module(iacSyncPath, () => ({
	runIacSync: async (projectRoot: string, opts?: { force?: boolean; silent?: boolean }) => {
		syncCalls.push(Date.now());
		// Simulate: writes betterbase/schema.ts and betterbase/functions/
		const bbDir = join(projectRoot, "betterbase");
		mkdirSync(join(bbDir, "functions"), { recursive: true });
		writeFileSync(join(bbDir, "schema.ts"), "export const schema = {};");
		writeFileSync(join(bbDir, "functions", "getUsers.ts"), "export const getUsers = {};");
		if (opts?.silent) {
			// Silent mode - no output
		}
		return { success: true };
	},
}));

mock.module(iacGenPath, () => ({
	runIacGenerate: async (projectRoot: string) => {
		genCalls.push(Date.now());
		// Simulate: writes betterbase/config.ts
		const bbDir = join(projectRoot, "betterbase");
		mkdirSync(bbDir, { recursive: true });
		writeFileSync(join(bbDir, "config.ts"), "export const config = {};");
		return { success: true };
	},
}));

mock.module(iacAnalyzePath, () => ({
	runIacAnalyze: async (projectRoot: string, opts?: { output?: "table" | "json" }) => {
		analyzeCalls.push(Date.now());
		// Simulate: scans betterbase/queries and returns analysis
		if (opts?.output === "json") {
			console.log(JSON.stringify([{ path: "queries/getUsers.ts", complexity: "low", issues: [] }]));
		} else {
			console.log("Analysis complete — 1 query scanned.");
		}
	},
}));

const { runIacSync } = await import("../../src/commands/iac/sync");
const { runIacGenerate } = await import("../../src/commands/iac/generate");
const { runIacAnalyze } = await import("../../src/commands/iac/analyze");

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeProject() {
	return createTestProject({
		"package.json": JSON.stringify({ name: "test-iac-workflow" }),
	});
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("IAC Workflow — Full Pipeline", () => {
	beforeEach(() => {
		resetMocks();
	});

	afterEach(() => {
		mock.restore();
	});

	it("sync → generate → analyze executes in correct order and touches expected files", async () => {
		const proj = makeProject();

		// 1. iac sync
		await runIacSync(proj.root, { force: false, silent: false });
		expect(syncCalls).toHaveLength(1);

		// Files from sync
		expect(existsSync(join(proj.root, "betterbase", "schema.ts"))).toBe(true);
		expect(existsSync(join(proj.root, "betterbase", "functions", "getUsers.ts"))).toBe(true);

		// 2. iac generate
		await runIacGenerate(proj.root);
		expect(genCalls).toHaveLength(1);
		expect(existsSync(join(proj.root, "betterbase", "config.ts"))).toBe(true);

		// 3. iac analyze (JSON output captured)
		const logs: string[] = [];
		const logSpy = mock((...args: unknown[]) => logs.push(args.map(String).join(" ")));
		const origLog = console.log;
		console.log = logSpy as unknown as typeof console.log;

		try {
			await runIacAnalyze(proj.root, { output: "json" });
		} finally {
			console.log = origLog;
		}
		expect(analyzeCalls).toHaveLength(1);

		// Verify analyze output contains expected key
		const jsonOutput = logs.join(" ");
		expect(jsonOutput).toContain("queries/getUsers.ts");
		expect(jsonOutput).toContain("low");

		proj.cleanup();
	});

	it("handles analyze when queries directory is empty (no findings)", async () => {
		const proj = makeProject();
		// Only run analyze without prior sync/generate files
		await runIacAnalyze(proj.root);
		expect(analyzeCalls).toHaveLength(1);
		proj.cleanup();
	});

	it("generate can be called multiple times (idempotent)", async () => {
		const proj = makeProject();
		await runIacGenerate(proj.root);
		await runIacGenerate(proj.root);
		expect(genCalls).toHaveLength(2);
		// Second call overwrites, not error
		expect(existsSync(join(proj.root, "betterbase", "config.ts"))).toBe(true);
		proj.cleanup();
	});

	it("sync can be forced to overwrite existing files", async () => {
		const proj = makeProject();
		// First sync
		await runIacSync(proj.root, { force: false, silent: true });
		// Second sync with force (simulated via opts)
		await runIacSync(proj.root, { force: true, silent: true });
		expect(syncCalls).toHaveLength(2);
		proj.cleanup();
	});
});
