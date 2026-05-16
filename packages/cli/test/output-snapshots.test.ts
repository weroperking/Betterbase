import { afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runIacAnalyze } from "../src/commands/iac/analyze";

const SNAPSHOT_DIR = join(import.meta.dir, "snapshots");
const JSON_SNAPSHOT = join(SNAPSHOT_DIR, "iac-analyze-empty.json");

describe("output-snapshots: iac analyze", () => {
	let tmpDir: string;

	beforeAll(() => {
		// Ensure snapshot directory exists (should be present)
		if (!existsSync(SNAPSHOT_DIR)) {
			mkdirSync(SNAPSHOT_DIR, { recursive: true });
		}
	});

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "bb-snap-"));
		// Create minimal betterbase/queries directory (empty)
		const queriesDir = join(tmpDir, "betterbase", "queries");
		mkdirSync(queriesDir, { recursive: true });
	});

	afterEach(() => {
		try {
			rmSync(tmpDir, { recursive: true, force: true });
		} catch { /* ignore */ }
	});

	it("produces expected JSON output on empty project (snapshot)", async () => {
		// Capture console.log
		const logs: string[] = [];
		const logSpy = mock((...args: unknown[]) => {
			logs.push(args.map(String).join(" "));
		});
		const origLog = console.log;
		console.log = logSpy as unknown as typeof console.log;

		try {
			await runIacAnalyze(tmpDir, { output: "json" });
		} finally {
			console.log = origLog;
		}

		// The JSON output is typically the last log entry
		const jsonOutput = logs[logs.length - 1] ?? "";

		// Normalize: trim whitespace
		const actual = jsonOutput.trim();

		// Load snapshot
		const expectedRaw = readFileSync(JSON_SNAPSHOT, "utf-8");
		const expected = expectedRaw.trim();

		expect(actual).toBe(expected);
	});
});
