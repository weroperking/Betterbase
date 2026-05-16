import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createTestProject } from "../fixtures/fixtures";

// ── Mock state tracking ────────────────────────────────────────────────────────────
let processManagerStarted = false;
let processManagerStopped = false;
let processManagerRestartCount = 0;
let watcherStarted = false;
let watcherStopped = false;
let queryLogEnabled = false;
let queryLogDisabled = false;
let contextGenerated = false;
let contextGenerateShouldThrow = false;
let contextGenerateError = "";
let iacSyncCalled = false;
let iacGenerateCalled = false;

// Track current test project for cleanup
let currentProject: ReturnType<typeof createTestProject> | null = null;

// ── Mock state reset ─────────────────────────────────────────────────────────────
function resetMockState() {
	processManagerStarted = false;
	processManagerStopped = false;
	processManagerRestartCount = 0;
	watcherStarted = false;
	watcherStopped = false;
	queryLogEnabled = false;
	queryLogDisabled = false;
	contextGenerated = false;
	contextGenerateShouldThrow = false;
	contextGenerateError = "";
	iacSyncCalled = false;
	iacGenerateCalled = false;
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
const processManagerPath = path.resolve(__dirname, "../../src/commands/dev/process-manager.ts");
const watcherPath = path.resolve(__dirname, "../../src/commands/dev/watcher.ts");
const queryLogPath = path.resolve(__dirname, "../../src/commands/dev/query-log.ts");
const contextGenPath = path.resolve(__dirname, "../../src/utils/context-generator.ts");
const iacGenPath = path.resolve(__dirname, "../../src/commands/iac/generate.ts");
const iacSyncPath = path.resolve(__dirname, "../../src/commands/iac/sync.ts");

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
			if (contextGenerateShouldThrow) {
				throw new Error(contextGenerateError || "Simulated generation failure");
			}
			return {};
		}
	},
}));

mock.module(iacGenPath, () => ({
	runIacGenerate: async () => {
		iacGenerateCalled = true;
	},
}));

mock.module(iacSyncPath, () => ({
	runIacSync: async () => {
		iacSyncCalled = true;
	},
}));

// ── Dynamic import after mocks registered ─────────────────────────────────────────
const { runDevCommand } = await import("../../src/commands/dev");

// ═══════════════════════════════════════════════════════════════════════════════════
describe("runDevCommand", () => {
	let envBackup: ReturnType<typeof saveEnv>;
	let baselineSIGINT: ((...args: any[]) => void)[];
	let baselineSIGTERM: ((...args: any[]) => void)[];

beforeEach(() => {
	resetMockState();
	// Clean up any leftover project from previous test
	if (currentProject) {
		currentProject.cleanup();
		currentProject = null;
	}
	envBackup = saveEnv();
	delete process.env.QUERY_LOG;
	process.env.NODE_ENV = "test";
	baselineSIGINT = process.listeners("SIGINT") as ((...args: any[]) => void)[];
	baselineSIGTERM = process.listeners("SIGTERM") as ((...args: any[]) => void)[];
});

afterEach(() => {
	// Remove only handlers added during the test
	const currentSIGINT = process.listeners("SIGINT") as ((...args: any[]) => void)[];
	const currentSIGTERM = process.listeners("SIGTERM") as ((...args: any[]) => void)[];
	for (const fn of currentSIGINT) {
		if (!baselineSIGINT.includes(fn)) {
			process.removeListener("SIGINT", fn);
		}
	}
	for (const fn of currentSIGTERM) {
		if (!baselineSIGTERM.includes(fn)) {
			process.removeListener("SIGTERM", fn);
		}
	}
	if (currentProject) {
		currentProject.cleanup();
		currentProject = null;
	}
	restoreEnv(envBackup);
});

	// 1 ──────────────────────────────────────────────────────────────────────────────
	it("creates cleanup function", async () => {
		currentProject = createTestProject({
			"package.json": JSON.stringify({ name: "test" }),
			"src/index.ts": "const app = {};\nexport default { port: 0, fetch: () => {} };\n",
			"src/db/schema.ts": "export const users = {};\n",
		});

		const cleanup = await runDevCommand(currentProject.root);

		expect(cleanup).toBeFunction();
		expect(processManagerStarted).toBe(true);
		expect(watcherStarted).toBe(true);

		await cleanup();
	});

	// 2 ──────────────────────────────────────────────────────────────────────────────
	it("detects betterbase/ directory", async () => {
		currentProject = createTestProject({
			"package.json": JSON.stringify({ name: "test" }),
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
			"betterbase/schema.ts": "export default {};\n",
		});

		const cleanup = await runDevCommand(currentProject.root);

		expect(iacSyncCalled).toBe(true);
		expect(iacGenerateCalled).toBe(true);

		await cleanup();
	});

	// 3 ──────────────────────────────────────────────────────────────────────────────
	it("handles missing betterbase/ gracefully", async () => {
		currentProject = createTestProject({
			"package.json": JSON.stringify({ name: "test" }),
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(currentProject.root);

		expect(iacSyncCalled).toBe(false);
		expect(iacGenerateCalled).toBe(false);
		expect(processManagerStarted).toBe(true);

		await cleanup();
	});

	// 4 ──────────────────────────────────────────────────────────────────────────────
	it("QUERY_LOG=true enables query log", async () => {
		process.env.QUERY_LOG = "true";
		currentProject = createTestProject({
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(currentProject.root);

		expect(queryLogEnabled).toBe(true);
		expect(queryLogDisabled).toBe(false);

		await cleanup();

		expect(queryLogDisabled).toBe(true);
	});

	// 5 ──────────────────────────────────────────────────────────────────────────────
	it("QUERY_LOG=false disables query log", async () => {
		process.env.QUERY_LOG = "false";
		currentProject = createTestProject({
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(currentProject.root);

		expect(queryLogEnabled).toBe(false);

		await cleanup();
	});

	// 6 ──────────────────────────────────────────────────────────────────────────────
	it("validates project root exists", async () => {
		const cleanup = await runDevCommand("/nonexistent/path/12345");

		expect(cleanup).toBeFunction();

		await cleanup();
	});

	// 7 ──────────────────────────────────────────────────────────────────────────────
	it("cleanup function can be called without error", async () => {
		currentProject = createTestProject({
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(currentProject.root);

		await expect(cleanup()).resolves.toBeUndefined();

		expect(processManagerStopped).toBe(true);
		expect(watcherStopped).toBe(true);
	});

	// 8 ──────────────────────────────────────────────────────────────────────────────
	it("handles missing schema gracefully", async () => {
		contextGenerateShouldThrow = true;
		contextGenerateError = "Cannot find module: @betterbase/core";

		currentProject = createTestProject({
			"src/index.ts": "export default { port: 0, fetch: () => {} };\n",
		});

		const cleanup = await runDevCommand(currentProject.root);

		expect(watcherStarted).toBe(true);
		expect(processManagerStarted).toBe(true);

		await cleanup();
	});
});
