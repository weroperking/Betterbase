import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createTestProject } from "./fixtures/fixtures";

// ── Mock state tracking ────────────────────────────────────────────────────────────
let processManagerStarted = false;
let processManagerStopped = false;
let processManagerRestartCount = 0;
let watcherStarted = false;
let watcherStopped = false;
let queryLogEnabled = false;
let queryLogDisabled = false;
let contextGenerated = false;
let iacSyncCalled = false;
let iacSyncShouldThrow = false;
let iacSyncError = "";
let iacGenerateCalled = false;
let iacGenerateShouldThrow = false;
let iacGenerateError = "";

function resetMockState() {
	processManagerStarted = false;
	processManagerStopped = false;
	processManagerRestartCount = 0;
	watcherStarted = false;
	watcherStopped = false;
	queryLogEnabled = false;
	queryLogDisabled = false;
	contextGenerated = false;
	iacSyncCalled = false;
	iacSyncShouldThrow = false;
	iacSyncError = "";
	iacGenerateCalled = false;
	iacGenerateShouldThrow = false;
	iacGenerateError = "";
}

// ── Env backup / restore ──────────────────────────────────────────────────────────
function saveEnv() {
	const orig: Record<string, string | undefined> = {};
	for (const key of ["QUERY_LOG", "NODE_ENV"]) {
		orig[key] = process.env[key];
	}
	return orig;
}

function restoreEnv(orig: Record<string, string | undefined>) {
	for (const key of Object.keys(orig)) {
		if (orig[key] !== undefined) {
			process.env[key] = orig[key];
		} else {
			delete process.env[key];
		}
	}
}

// ── Mocks ─────────────────────────────────────────────────────────────────────────
const processManagerPath = path.resolve(__dirname, "../src/commands/dev/process-manager.ts");
const watcherPath = path.resolve(__dirname, "../src/commands/dev/watcher.ts");
const queryLogPath = path.resolve(__dirname, "../src/commands/dev/query-log.ts");
const contextGenPath = path.resolve(__dirname, "../src/utils/context-generator.ts");
const iacGenPath = path.resolve(__dirname, "../src/commands/iac/generate.ts");
const iacSyncPath = path.resolve(__dirname, "../src/commands/iac/sync.ts");

mock.module(processManagerPath, () => ({
	ProcessManager: class {
		async start() {
			processManagerStarted = true;
		}
		async stop() {
			processManagerStopped = true;
		}
		async restart(_reason: string) {
			processManagerRestartCount++;
		}
	},
}));

mock.module(watcherPath, () => ({
	DevWatcher: class {
		on(_handler: unknown) {
			return this;
		}
		start(_projectRoot: string) {
			watcherStarted = true;
		}
		stop() {
			watcherStopped = true;
		}
	},
}));

mock.module(queryLogPath, () => {
	const queryLogMock = {
		enable() {
			queryLogEnabled = true;
		},
		disable() {
			queryLogDisabled = true;
		},
		log(_entry: unknown) {},
		getEntries() {
			return [];
		},
		clear() {},
	};
	return { queryLog: queryLogMock, QueryLog: class {} };
});

mock.module(contextGenPath, () => ({
	ContextGenerator: class {
		async generate(_projectRoot: string) {
			contextGenerated = true;
			return {};
		}
	},
}));

mock.module(iacGenPath, () => ({
	runIacGenerate: async () => {
		if (iacGenerateShouldThrow) {
			throw new Error(iacGenerateError || "IAC generate failure");
		}
		iacGenerateCalled = true;
	},
}));

mock.module(iacSyncPath, () => ({
	runIacSync: async () => {
		if (iacSyncShouldThrow) {
			throw new Error(iacSyncError || "IAC sync failure");
		}
		iacSyncCalled = true;
	},
}));

// ── Dynamic import after mocks registered ─────────────────────────────────────────
const { runDevCommand } = await import("../src/commands/dev");

// ═══════════════════════════════════════════════════════════════════════════════════
describe("runDevCommand", () => {
	let envBackup: ReturnType<typeof saveEnv>;

	beforeEach(() => {
		resetMockState();
		envBackup = saveEnv();
		delete process.env.QUERY_LOG;
		process.env.NODE_ENV = "test";
	});

	afterEach(() => {
		restoreEnv(envBackup);
		process.removeAllListeners("SIGINT");
		process.removeAllListeners("SIGTERM");
	});

	// 1 ──────────────────────────────────────────────────────────────────────────────
	it("is a callable async function", () => {
		expect(runDevCommand).toBeFunction();
		expect(runDevCommand.constructor.name).toBe("AsyncFunction");
	});

	// 2 ──────────────────────────────────────────────────────────────────────────────
	it("returns a cleanup function", async () => {
		const project = createTestProject({
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(project.root);

		expect(cleanup).toBeFunction();

		await cleanup();
		project.cleanup();
	});

	// 3 ──────────────────────────────────────────────────────────────────────────────
	it("cleanup function resolves without error", async () => {
		const project = createTestProject({
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(project.root);

		await expect(cleanup()).resolves.toBeUndefined();

		project.cleanup();
	});

	// 4 ──────────────────────────────────────────────────────────────────────────────
	it("starts ProcessManager when invoked", async () => {
		const project = createTestProject({
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(project.root);

		expect(processManagerStarted).toBe(true);

		await cleanup();
		project.cleanup();
	});

	// 5 ──────────────────────────────────────────────────────────────────────────────
	it("starts DevWatcher when invoked", async () => {
		const project = createTestProject({
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(project.root);

		expect(watcherStarted).toBe(true);

		await cleanup();
		project.cleanup();
	});

	// 6 ──────────────────────────────────────────────────────────────────────────────
	it("skips IAC sync and generate when no betterbase/ directory", async () => {
		const project = createTestProject({
			"package.json": JSON.stringify({ name: "test" }),
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(project.root);

		expect(iacSyncCalled).toBe(false);
		expect(iacGenerateCalled).toBe(false);
		expect(processManagerStarted).toBe(true);

		await cleanup();
		project.cleanup();
	});

	// 7 ──────────────────────────────────────────────────────────────────────────────
	it("calls IAC sync and generate when betterbase/ directory exists", async () => {
		const project = createTestProject({
			"package.json": JSON.stringify({ name: "test" }),
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
			"betterbase/schema.ts": "export default {};\n",
		});

		const cleanup = await runDevCommand(project.root);

		expect(iacSyncCalled).toBe(true);
		expect(iacGenerateCalled).toBe(true);

		await cleanup();
		project.cleanup();
	});

	// 8 ──────────────────────────────────────────────────────────────────────────────
	it("does not crash when IAC sync throws an error", async () => {
		iacSyncShouldThrow = true;
		iacSyncError = "Schema parse error";

		const project = createTestProject({
			"package.json": JSON.stringify({ name: "test" }),
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
			"betterbase/schema.ts": "export default {};\n",
		});

		const cleanup = await runDevCommand(project.root);

		// Should not crash — sync failure is caught and warned
		expect(processManagerStarted).toBe(true);
		expect(watcherStarted).toBe(true);

		await cleanup();
		project.cleanup();
	});

	// 9 ──────────────────────────────────────────────────────────────────────────────
	it("does not crash when IAC generate throws an error", async () => {
		iacGenerateShouldThrow = true;
		iacGenerateError = "Generation failure";

		const project = createTestProject({
			"package.json": JSON.stringify({ name: "test" }),
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
			"betterbase/schema.ts": "export default {};\n",
		});

		const cleanup = await runDevCommand(project.root);

		// IAC sync should still have been called before generate
		expect(iacSyncCalled).toBe(true);
		// Should not crash — generate failure is caught and warned
		expect(processManagerStarted).toBe(true);
		expect(watcherStarted).toBe(true);

		await cleanup();
		project.cleanup();
	});

	// 10 ─────────────────────────────────────────────────────────────────────────────
	it("enables query log when QUERY_LOG=true", async () => {
		process.env.QUERY_LOG = "true";

		const project = createTestProject({
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(project.root);

		expect(queryLogEnabled).toBe(true);

		await cleanup();

		expect(queryLogDisabled).toBe(true);

		project.cleanup();
	});

	// 11 ─────────────────────────────────────────────────────────────────────────────
	it("does not enable query log when QUERY_LOG is unset", async () => {
		delete process.env.QUERY_LOG;

		const project = createTestProject({
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(project.root);

		expect(queryLogEnabled).toBe(false);

		await cleanup();
		project.cleanup();
	});

	// 12 ─────────────────────────────────────────────────────────────────────────────
	it("cleanup stops ProcessManager and DevWatcher", async () => {
		const project = createTestProject({
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(project.root);

		await cleanup();

		expect(processManagerStopped).toBe(true);
		expect(watcherStopped).toBe(true);
		expect(queryLogDisabled).toBe(true);

		project.cleanup();
	});

	// 13 ─────────────────────────────────────────────────────────────────────────────
	it("accepts projectRoot with a nonexistent path gracefully", async () => {
		const cleanup = await runDevCommand("/nonexistent/path/12345");

		expect(cleanup).toBeFunction();
		// Should still start the process manager and watcher
		expect(processManagerStarted).toBe(true);
		expect(watcherStarted).toBe(true);

		await cleanup();
	});

	// 14 ─────────────────────────────────────────────────────────────────────────────
	it("generates context on startup", async () => {
		const project = createTestProject({
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(project.root);

		expect(contextGenerated).toBe(true);

		await cleanup();
		project.cleanup();
	});
});
