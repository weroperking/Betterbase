/**
 * IAC Workflow — Full Pipeline Integration Tests
 *
 * Phase 4 deliverable: tests that exercise the complete IaC workflow:
 *   iac sync  →  iac generate  →  iac analyze
 *
 * Verifies file outputs, ordering guarantees, and end-to-end behavior.
 */

import { afterEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestProject } from "../fixtures/fixtures";

import { runIacSync } from "../../src/commands/iac/sync";
import { runIacGenerate } from "../../src/commands/iac/generate";
import { runIacAnalyze } from "../../src/commands/iac/analyze";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeProject() {
	const proj = createTestProject({
		"package.json": JSON.stringify({ name: "test-iac-workflow" }),
		// Real BetterBase IaC schema that sync expects
		"betterbase/schema.ts": `
import { defineSchema, defineTable, text, timestamp } from "@betterbase/core";

export default defineSchema({
  user: defineTable({
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  }),
});
		`,
	});

	// Link @betterbase/core from the workspace into the temp project
	const nodeModulesPath = join(proj.root, "node_modules", "@betterbase");
	mkdirSync(nodeModulesPath, { recursive: true });
	const coreTarget = join(__dirname, "../../../core");
	const coreLink = join(nodeModulesPath, "core");
	if (!existsSync(coreLink)) {
		symlinkSync(coreTarget, coreLink);
	}

	return proj;
}

function captureConsole() {
	const lines: string[] = [];
	const logSpy = mock((...args: unknown[]) => lines.push(args.map(String).join(" ")));
	const origLog = console.log;
	console.log = logSpy as unknown as typeof console.log;
	return { lines, restore: () => { console.log = origLog; } };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("IAC Workflow Pipeline (real implementations)", () => {
	afterEach(() => {
		mock.restore();
	});

	it("iac sync generates schema.json and drizzle migrations", async () => {
		const proj = makeProject();
		try {
			await runIacSync(proj.root);
			expect(existsSync(join(proj.root, "betterbase/_generated/schema.json"))).toBe(true);
			expect(existsSync(join(proj.root, "drizzle/migrations"))).toBe(true);
		} finally {
			proj.cleanup();
		}
	});

	it("iac generate creates api.d.ts", async () => {
		const proj = makeProject();
		try {
			await runIacGenerate(proj.root);
			expect(existsSync(join(proj.root, "betterbase/_generated/api.d.ts"))).toBe(true);
		} finally {
			proj.cleanup();
		}
	});

	it("iac analyze scans queries and outputs analysis", async () => {
		const proj = makeProject();
		try {
			mkdirSync(join(proj.root, "betterbase", "queries"), { recursive: true });
			writeFileSync(
				join(proj.root, "betterbase", "queries", "getUsers.ts"),
				`import { query } from "@betterbase/core";
export const getUsers = query((c) => c.table("user").select());`,
			);
			const captured = captureConsole();
			try {
				await runIacAnalyze(proj.root);
				expect(captured.lines.length).toBeGreaterThan(0);
			} finally {
				captured.restore();
			}
		} finally {
			proj.cleanup();
		}
	});

	it("full pipeline: sync → generate → analyze", async () => {
		const proj = makeProject();
		try {
			await runIacSync(proj.root);
			await runIacGenerate(proj.root);
			expect(existsSync(join(proj.root, "betterbase/_generated/api.d.ts"))).toBe(true);

			const captured = captureConsole();
			try {
				await runIacAnalyze(proj.root);
				expect(captured.lines.length).toBeGreaterThan(0);
			} finally {
				captured.restore();
			}
		} finally {
			proj.cleanup();
		}
	});
});
