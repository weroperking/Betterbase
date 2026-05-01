/**
 * Function CLI Commands — Integration Behavioral Tests
 *
 * Tests all function command operations via runFunctionCommand routing
 * with mocked @betterbase/core/functions and real filesystem operations.
 * Replaces the 10 stub tests from test/function-commands.test.ts.
 */

import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestProject } from "../fixtures/fixtures";

// ── Mutable mock state ───────────────────────────────────────────────────────

let mockListFunctionsResult: Array<{ name: string; runtime: string }> = [
  { name: "hello", runtime: "cloudflare-workers" },
  { name: "auth-webhook", runtime: "vercel-edge" },
];
let mockIsFunctionBuiltResult: boolean = true;
let mockBundleFunctionResult: {
  success: boolean;
  outputPath?: string;
  size?: number;
  errors: string[];
} = { success: true, outputPath: "/tmp/test.js", size: 1024, errors: [] };
let mockReadFunctionConfigResult: {
  name: string;
  runtime: "cloudflare-workers" | "vercel-edge";
  env: string[];
} | undefined = { name: "test", runtime: "cloudflare-workers", env: [] };
let mockDeployToCloudflareResult: {
  success: boolean;
  url?: string;
  logs: string[];
} = { success: true, url: "https://test.example.workers.dev", logs: [] };
let mockDeployToVercelResult: {
  success: boolean;
  url?: string;
  logs: string[];
} = { success: true, url: "https://test.vercel.app", logs: [] };
let mockGetCloudflareLogsResult: {
  success: boolean;
  message?: string;
  logs: string[];
} = { success: true, message: "", logs: ["GET / 200 2ms", "POST /api 201 5ms"] };
let mockGetVercelLogsResult: {
  success: boolean;
  message?: string;
  logs: string[];
} = { success: true, message: "", logs: ["200 / 2ms", "201 /api 5ms"] };
let mockSyncEnvToCloudflareResult: { success: boolean; message: string } = {
  success: true,
  message: "Env vars synced",
};

// ── Spies ────────────────────────────────────────────────────────────────────

const listFunctionsSpy = mock(async () => [...mockListFunctionsResult]);
const isFunctionBuiltSpy = mock(async () => mockIsFunctionBuiltResult);
const readFunctionConfigSpy = mock(async () =>
  mockReadFunctionConfigResult ? { ...mockReadFunctionConfigResult } : undefined,
);
const bundleFunctionSpy = mock(async () => ({ ...mockBundleFunctionResult }));
const deployToCloudflareSpy = mock(async () => ({ ...mockDeployToCloudflareResult }));
const deployToVercelSpy = mock(async () => ({ ...mockDeployToVercelResult }));
const getCloudflareLogsSpy = mock(async () => ({ ...mockGetCloudflareLogsResult }));
const getVercelLogsSpy = mock(async () => ({ ...mockGetVercelLogsResult }));
const syncEnvToCloudflareSpy = mock(async () => ({ ...mockSyncEnvToCloudflareResult }));

// ── Module mocks (must be before the dynamic import) ─────────────────────────

mock.module("@betterbase/core/functions", () => ({
  listFunctions: listFunctionsSpy,
  isFunctionBuilt: isFunctionBuiltSpy,
  readFunctionConfig: readFunctionConfigSpy,
  bundleFunction: bundleFunctionSpy,
  deployToCloudflare: deployToCloudflareSpy,
  deployToVercel: deployToVercelSpy,
  getCloudflareLogs: getCloudflareLogsSpy,
  getVercelLogs: getVercelLogsSpy,
  syncEnvToCloudflare: syncEnvToCloudflareSpy,
}));

// ── Dynamic import after mocks ───────────────────────────────────────────────

const { runFunctionCommand, stopAllFunctions } = await import("../../src/commands/function");

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetAllMocks(): void {
  mockListFunctionsResult = [
    { name: "hello", runtime: "cloudflare-workers" },
    { name: "auth-webhook", runtime: "vercel-edge" },
  ];
  mockIsFunctionBuiltResult = true;
  mockBundleFunctionResult = { success: true, outputPath: "/tmp/test.js", size: 1024, errors: [] };
  mockReadFunctionConfigResult = { name: "test", runtime: "cloudflare-workers", env: [] };
  mockDeployToCloudflareResult = {
    success: true,
    url: "https://test.example.workers.dev",
    logs: [],
  };
  mockDeployToVercelResult = { success: true, url: "https://test.vercel.app", logs: [] };
  mockGetCloudflareLogsResult = { success: true, message: "", logs: ["GET / 200 2ms"] };
  mockGetVercelLogsResult = { success: true, message: "", logs: ["200 / 2ms"] };
  mockSyncEnvToCloudflareResult = { success: true, message: "Env vars synced" };

  listFunctionsSpy.mockClear();
  isFunctionBuiltSpy.mockClear();
  readFunctionConfigSpy.mockClear();
  bundleFunctionSpy.mockClear();
  deployToCloudflareSpy.mockClear();
  deployToVercelSpy.mockClear();
  getCloudflareLogsSpy.mockClear();
  getVercelLogsSpy.mockClear();
  syncEnvToCloudflareSpy.mockClear();

  listFunctionsSpy.mockImplementation(async () => [...mockListFunctionsResult]);
  isFunctionBuiltSpy.mockImplementation(async () => mockIsFunctionBuiltResult);
  readFunctionConfigSpy.mockImplementation(async () =>
    mockReadFunctionConfigResult ? { ...mockReadFunctionConfigResult } : undefined,
  );
  bundleFunctionSpy.mockImplementation(async () => ({ ...mockBundleFunctionResult }));
  deployToCloudflareSpy.mockImplementation(async () => ({ ...mockDeployToCloudflareResult }));
  deployToVercelSpy.mockImplementation(async () => ({ ...mockDeployToVercelResult }));
  getCloudflareLogsSpy.mockImplementation(async () => ({ ...mockGetCloudflareLogsResult }));
  getVercelLogsSpy.mockImplementation(async () => ({ ...mockGetVercelLogsResult }));
  syncEnvToCloudflareSpy.mockImplementation(async () => ({ ...mockSyncEnvToCloudflareResult }));
}

function captureConsole() {
  const lines: string[] = [];
  const logSpy = mock((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  const errorSpy = mock((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  const warnSpy = mock((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;
  console.log = logSpy as unknown as typeof console.log;
  console.error = errorSpy as unknown as typeof console.error;
  console.warn = warnSpy as unknown as typeof console.warn;
  return {
    lines,
    restore: () => {
      console.log = origLog;
      console.error = origError;
      console.warn = origWarn;
    },
  };
}

// ── Test state ───────────────────────────────────────────────────────────────

let projectRoot: string;
let captured: ReturnType<typeof captureConsole>;

afterEach(() => {
  captured?.restore();
  if (projectRoot) {
    try {
      rmSync(projectRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  resetAllMocks();
});

afterAll(() => {
  mock.restore();
});

// ═══════════════════════════════════════════════════════════════════════════════
// runFunctionCommand — "create"
// ═══════════════════════════════════════════════════════════════════════════════

describe("runFunctionCommand create", () => {
  it("creates a function directory with index.ts and config.ts", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["create", "my-custom-func"], projectRoot);

    const funcDir = join(projectRoot, "src", "functions", "my-custom-func");
    expect(existsSync(funcDir)).toBe(true);
    expect(existsSync(join(funcDir, "index.ts"))).toBe(true);
    expect(existsSync(join(funcDir, "config.ts"))).toBe(true);

    const indexContent = readFileSync(join(funcDir, "index.ts"), "utf-8");
    expect(indexContent).toContain("import { Hono } from 'hono'");
    expect(indexContent).toContain("const app = new Hono()");
    expect(indexContent).toContain("export default app");

    const configContent = readFileSync(join(funcDir, "config.ts"), "utf-8");
    expect(configContent).toContain("name: 'my-custom-func'");
    expect(configContent).toContain("runtime: 'cloudflare-workers'");

    const output = captured.lines.join("\n");
    expect(output).toContain("Function created: src/functions/my-custom-func/");
    expect(output).toContain("Run with: bb function dev my-custom-func");
  });

  it("creates a function with hyphens and underscores in name", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["create", "webhook_handler-v2"], projectRoot);

    const funcDir = join(projectRoot, "src", "functions", "webhook_handler-v2");
    expect(existsSync(funcDir)).toBe(true);
    expect(existsSync(join(funcDir, "index.ts"))).toBe(true);
    expect(existsSync(join(funcDir, "config.ts"))).toBe(true);

    const configContent = readFileSync(join(funcDir, "config.ts"), "utf-8");
    expect(configContent).toContain("name: 'webhook_handler-v2'");
  });

  it("rejects names with special characters", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["create", "bad@name!"], projectRoot);

    const funcDir = join(projectRoot, "src", "functions", "bad@name!");
    expect(existsSync(funcDir)).toBe(false);

    const output = captured.lines.join("\n");
    expect(output).toContain("can only contain letters, numbers, underscores, and hyphens");
  });

  it("rejects names with spaces", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["create", "my function"], projectRoot);

    const funcDir = join(projectRoot, "src", "functions", "my function");
    expect(existsSync(funcDir)).toBe(false);

    const output = captured.lines.join("\n");
    expect(output).toContain("can only contain letters, numbers, underscores, and hyphens");
  });

  it("rejects names with dots (e.g. path traversal)", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["create", "../escape"], projectRoot);

    const funcDir = join(projectRoot, "src", "functions", "../escape");
    expect(existsSync(join(projectRoot, "src", "functions", "../escape"))).toBe(false);

    const output = captured.lines.join("\n");
    expect(output).toContain("can only contain letters, numbers, underscores, and hyphens");
  });

  it("rejects missing function name", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["create"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Function name is required");
    expect(output).toContain("Usage: bb function create <name>");
  });

  it("rejects duplicate function name", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    // Create the function first
    await runFunctionCommand(["create", "duplicate-func"], projectRoot);
    const funcDir = join(projectRoot, "src", "functions", "duplicate-func");
    expect(existsSync(funcDir)).toBe(true);

    // Try creating the same name again
    captured = captureConsole();
    await runFunctionCommand(["create", "duplicate-func"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain(`Function "duplicate-func" already exists`);
  });

  it("index.ts template contains POST handler", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    await runFunctionCommand(["create", "api-handler"], projectRoot);

    const indexContent = readFileSync(
      join(projectRoot, "src", "functions", "api-handler", "index.ts"),
      "utf-8",
    );
    expect(indexContent).toContain("app.post(");
    expect(indexContent).toContain("c.req.json()");
    expect(indexContent).toContain("received: body");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runFunctionCommand — "list"
// ═══════════════════════════════════════════════════════════════════════════════

describe("runFunctionCommand list", () => {
  it("lists functions with proper table format", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    mockListFunctionsResult = [
      { name: "hello", runtime: "cloudflare-workers" },
      { name: "auth-webhook", runtime: "vercel-edge" },
    ];
    mockIsFunctionBuiltResult = true;

    captured = captureConsole();
    await runFunctionCommand(["list"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Functions");
    expect(output).toContain("Name");
    expect(output).toContain("Runtime");
    expect(output).toContain("Status");
    expect(output).toContain("hello");
    expect(output).toContain("auth-webhook");
    expect(output).toContain("cloudflare-workers");
    expect(output).toContain("vercel-edge");
    expect(output).toContain("built");

    expect(listFunctionsSpy).toHaveBeenCalledTimes(1);
  });

  it("shows 'not built' status for unbuilt functions", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    mockListFunctionsResult = [{ name: "wip-func", runtime: "cloudflare-workers" }];
    mockIsFunctionBuiltResult = false;

    captured = captureConsole();
    await runFunctionCommand(["list"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("wip-func");
    expect(output).toContain("not built");

    expect(isFunctionBuiltSpy).toHaveBeenCalledTimes(1);
    expect(isFunctionBuiltSpy).toHaveBeenCalledWith("wip-func", projectRoot);
  });

  it("shows message when no functions exist", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    mockListFunctionsResult = [];

    captured = captureConsole();
    await runFunctionCommand(["list"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("No functions found");
    expect(output).toContain("bb function create <name>");
    expect(output).not.toContain("Name");
    expect(output).not.toContain("|---");
  });

  it("calls isFunctionBuilt for each function", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    mockListFunctionsResult = [
      { name: "func-a", runtime: "cloudflare-workers" },
      { name: "func-b", runtime: "vercel-edge" },
    ];

    captured = captureConsole();
    await runFunctionCommand(["list"], projectRoot);

    expect(isFunctionBuiltSpy).toHaveBeenCalledTimes(2);
    expect(isFunctionBuiltSpy).toHaveBeenCalledWith("func-a", projectRoot);
    expect(isFunctionBuiltSpy).toHaveBeenCalledWith("func-b", projectRoot);
  });

  it("handles mixed built/not-built status across functions", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    mockListFunctionsResult = [
      { name: "built-func", runtime: "cloudflare-workers" },
      { name: "unbuilt-func", runtime: "vercel-edge" },
    ];

    // Return true first, then false
    let callCount = 0;
    isFunctionBuiltSpy.mockImplementation(async () => {
      callCount++;
      return callCount === 1;
    });

    captured = captureConsole();
    await runFunctionCommand(["list"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("built-func");
    expect(output).toContain("unbuilt-func");

    // Both statuses appear
    const lines = captured.lines;
    const builtCount = lines.filter((l) => l.includes("built")).length;
    const notBuiltCount = lines.filter((l) => l.includes("not built")).length;
    expect(builtCount).toBeGreaterThanOrEqual(1);
    expect(notBuiltCount).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runFunctionCommand — "build"
// ═══════════════════════════════════════════════════════════════════════════════

describe("runFunctionCommand build", () => {
  it("builds a function successfully", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    mockBundleFunctionResult = { success: true, outputPath: "/tmp/built.js", size: 2048, errors: [] };

    captured = captureConsole();
    await runFunctionCommand(["build", "test-func"], projectRoot);

    expect(bundleFunctionSpy).toHaveBeenCalledTimes(1);
    expect(bundleFunctionSpy).toHaveBeenCalledWith("test-func", projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Building function");
    expect(output).toContain("test-func");
    expect(output).toContain("Build successful");
    expect(output).toContain("/tmp/built.js");
    expect(output).toContain("2.00 KB");
  });

  it("reports errors when build fails", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    mockBundleFunctionResult = {
      success: false,
      errors: ["TypeError: Cannot read property 'x'", "SyntaxError: Unexpected token"],
    };

    captured = captureConsole();
    await runFunctionCommand(["build", "broken-func"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Build failed");
    expect(output).toContain("TypeError: Cannot read property 'x'");
    expect(output).toContain("SyntaxError: Unexpected token");
    expect(output).not.toContain("Build successful");
  });

  it("rejects missing function name", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["build"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Function name is required");
    expect(output).toContain("Usage: bb function build <name>");
    expect(bundleFunctionSpy).toHaveBeenCalledTimes(0);
  });

  it("handles bundle with multiple errors", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    mockBundleFunctionResult = {
      success: false,
      errors: ["Error 1: Missing import", "Error 2: Type mismatch", "Error 3: Circular dependency"],
    };

    captured = captureConsole();
    await runFunctionCommand(["build", "multi-error-func"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Build failed");
    expect(output).toContain("Error 1: Missing import");
    expect(output).toContain("Error 2: Type mismatch");
    expect(output).toContain("Error 3: Circular dependency");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runFunctionCommand — "deploy"
// ═══════════════════════════════════════════════════════════════════════════════

describe("runFunctionCommand deploy", () => {
  it("rejects missing function name", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["deploy"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Function name is required");
    expect(output).toContain("Usage: bb function deploy <name> [--sync-env]");
    expect(bundleFunctionSpy).toHaveBeenCalledTimes(0);
  });

  it("errors when function directory does not exist", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["deploy", "nonexistent-func"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain('Function "nonexistent-func" not found');
    expect(bundleFunctionSpy).toHaveBeenCalledTimes(0);
  });

  it("deploys to cloudflare-workers successfully", async () => {
    const project = createTestProject({
      "src/functions/cf-func/index.ts": "export default {}",
      "src/functions/cf-func/config.ts":
        "export default { name: 'cf-func', runtime: 'cloudflare-workers', env: [] }",
    });
    projectRoot = project.root;

    mockReadFunctionConfigResult = { name: "cf-func", runtime: "cloudflare-workers", env: [] };
    mockBundleFunctionResult = { success: true, outputPath: "/tmp/cf-func.js", size: 512, errors: [] };
    mockDeployToCloudflareResult = {
      success: true,
      url: "https://cf-func.example.workers.dev",
      logs: [],
    };

    captured = captureConsole();
    await runFunctionCommand(["deploy", "cf-func"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Deployment complete");
    expect(output).toContain("cf-func");
    expect(output).toContain("cloudflare-workers");
    expect(output).toContain("https://cf-func.example.workers.dev");

    expect(bundleFunctionSpy).toHaveBeenCalledTimes(1);
    expect(deployToCloudflareSpy).toHaveBeenCalledTimes(1);
    expect(deployToVercelSpy).toHaveBeenCalledTimes(0);
  });

  it("deploys to vercel-edge successfully", async () => {
    const project = createTestProject({
      "src/functions/vc-func/index.ts": "export default {}",
      "src/functions/vc-func/config.ts":
        "export default { name: 'vc-func', runtime: 'vercel-edge', env: [] }",
    });
    projectRoot = project.root;

    mockReadFunctionConfigResult = { name: "vc-func", runtime: "vercel-edge", env: [] };
    mockBundleFunctionResult = { success: true, outputPath: "/tmp/vc-func.js", size: 768, errors: [] };
    mockDeployToVercelResult = { success: true, url: "https://vc-func.vercel.app", logs: [] };

    captured = captureConsole();
    await runFunctionCommand(["deploy", "vc-func"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Deployment complete");
    expect(output).toContain("vc-func");
    expect(output).toContain("vercel-edge");

    expect(deployToVercelSpy).toHaveBeenCalledTimes(1);
    expect(deployToCloudflareSpy).toHaveBeenCalledTimes(0);
  });

  it("reports build failure during deploy", async () => {
    const project = createTestProject({
      "src/functions/broken-deploy/index.ts": "bad syntax",
    });
    projectRoot = project.root;

    mockReadFunctionConfigResult = { name: "broken-deploy", runtime: "cloudflare-workers", env: [] };
    mockBundleFunctionResult = {
      success: false,
      errors: ["Parse error: Unexpected identifier"],
    };

    captured = captureConsole();
    await runFunctionCommand(["deploy", "broken-deploy"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Build failed");
    expect(output).toContain("Parse error: Unexpected identifier");
    expect(deployToCloudflareSpy).toHaveBeenCalledTimes(0);
  });

  it("handles deployment failure after successful build", async () => {
    const project = createTestProject({
      "src/functions/fail-deploy/index.ts": "export default {}",
    });
    projectRoot = project.root;

    mockReadFunctionConfigResult = { name: "fail-deploy", runtime: "cloudflare-workers", env: [] };
    mockBundleFunctionResult = { success: true, outputPath: "/tmp/fail-deploy.js", size: 256, errors: [] };
    mockDeployToCloudflareResult = {
      success: false,
      logs: ["Error: Invalid script", "Error: Authentication failed"],
    };

    captured = captureConsole();
    await runFunctionCommand(["deploy", "fail-deploy"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Deployment failed");
    expect(output).toContain("Error: Invalid script");
    expect(output).toContain("Error: Authentication failed");
    expect(output).not.toContain("Deployment complete");
  });

  it("calls syncEnvToCloudflare when --sync-env flag is passed", async () => {
    const project = createTestProject({
      "src/functions/sync-func/index.ts": "export default {}",
      ".env": "SECRET_KEY=mysecretvalue\nAPI_URL=https://api.example.com\n",
    });
    projectRoot = project.root;

    mockReadFunctionConfigResult = {
      name: "sync-func",
      runtime: "cloudflare-workers",
      env: ["SECRET_KEY", "API_URL"],
    };
    mockBundleFunctionResult = { success: true, outputPath: "/tmp/sync-func.js", size: 256, errors: [] };
    mockDeployToCloudflareResult = {
      success: true,
      url: "https://sync-func.example.workers.dev",
      logs: [],
    };

    captured = captureConsole();
    await runFunctionCommand(["deploy", "sync-func", "--sync-env"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Syncing");
    expect(output).toContain("environment variables");
    expect(output).toContain("SECRET_KEY");
    expect(output).toContain("(set)");
    expect(output).toContain("API_URL");
    expect(syncEnvToCloudflareSpy).toHaveBeenCalledTimes(1);
  });

  it("warns about missing env vars in .env when syncing", async () => {
    const project = createTestProject({
      "src/functions/missing-env/index.ts": "export default {}",
      ".env": "EXISTING_KEY=value\n",
    });
    projectRoot = project.root;

    mockReadFunctionConfigResult = {
      name: "missing-env",
      runtime: "cloudflare-workers",
      env: ["EXISTING_KEY", "MISSING_KEY"],
    };
    mockBundleFunctionResult = { success: true, outputPath: "/tmp/missing-env.js", size: 256, errors: [] };
    mockDeployToCloudflareResult = {
      success: true,
      url: "https://missing-env.example.workers.dev",
      logs: [],
    };

    captured = captureConsole();
    await runFunctionCommand(["deploy", "missing-env", "--sync-env"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Warning: Missing env vars in .env: MISSING_KEY");
    expect(output).toContain("MISSING_KEY");
    expect(output).toContain("(not set)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runFunctionCommand — "logs"
// ═══════════════════════════════════════════════════════════════════════════════

describe("runFunctionCommand logs", () => {
  it("rejects missing function name", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["logs"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Function name is required");
    expect(output).toContain("Usage: bb function logs <name>");
  });

  it("fetches and displays cloudflare worker logs", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    mockReadFunctionConfigResult = { name: "cf-logs", runtime: "cloudflare-workers", env: [] };
    mockGetCloudflareLogsResult = {
      success: true,
      logs: ["[2026-04-29] GET /api 200 2ms", "[2026-04-29] POST /api 201 5ms"],
    };

    captured = captureConsole();
    await runFunctionCommand(["logs", "cf-logs"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain('Fetching logs for "cf-logs"');
    expect(output).toContain("cloudflare-workers");
    expect(output).toContain("Logs");
    expect(output).toContain("[2026-04-29] GET /api 200 2ms");
    expect(output).toContain("[2026-04-29] POST /api 201 5ms");

    expect(getCloudflareLogsSpy).toHaveBeenCalledTimes(1);
    expect(getCloudflareLogsSpy).toHaveBeenCalledWith("cf-logs", projectRoot);
  });

  it("shows error when cloudflare logs fetch fails", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    mockReadFunctionConfigResult = { name: "cf-fail", runtime: "cloudflare-workers", env: [] };
    mockGetCloudflareLogsResult = {
      success: false,
      message: "Authentication failed",
      logs: [],
    };

    captured = captureConsole();
    await runFunctionCommand(["logs", "cf-fail"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Authentication failed");
    expect(output).not.toContain("Logs:");
  });

  it("fetches and displays vercel edge logs", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    mockReadFunctionConfigResult = { name: "vc-logs", runtime: "vercel-edge", env: [] };
    mockGetVercelLogsResult = {
      success: true,
      logs: ["200 / 3ms", "201 /api 7ms"],
    };

    captured = captureConsole();
    await runFunctionCommand(["logs", "vc-logs"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain('Fetching logs for "vc-logs"');
    expect(output).toContain("vercel-edge");
    expect(output).toContain("200 / 3ms");
    expect(output).toContain("201 /api 7ms");

    expect(getVercelLogsSpy).toHaveBeenCalledTimes(1);
  });

  it("shows error when vercel logs fetch fails", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    mockReadFunctionConfigResult = { name: "vc-fail", runtime: "vercel-edge", env: [] };
    mockGetVercelLogsResult = {
      success: false,
      message: "Rate limit exceeded",
      logs: [],
    };

    captured = captureConsole();
    await runFunctionCommand(["logs", "vc-fail"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Rate limit exceeded");
    expect(output).not.toContain("Logs:");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runFunctionCommand — routing
// ═══════════════════════════════════════════════════════════════════════════════

describe("runFunctionCommand routing", () => {
  it('routes "create" to function creation', async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["create", "route-test"], projectRoot);

    const funcDir = join(projectRoot, "src", "functions", "route-test");
    expect(existsSync(funcDir)).toBe(true);
    expect(existsSync(join(funcDir, "index.ts"))).toBe(true);
  });

  it('routes "list" to function listing', async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["list"], projectRoot);

    expect(listFunctionsSpy).toHaveBeenCalledTimes(1);
    const output = captured.lines.join("\n");
    expect(output).toContain("Functions");
  });

  it('routes "build" to function building', async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["build", "bld-func"], projectRoot);

    expect(bundleFunctionSpy).toHaveBeenCalledTimes(1);
    expect(bundleFunctionSpy).toHaveBeenCalledWith("bld-func", projectRoot);
  });

  it('routes "deploy" to function deployment', async () => {
    const project = createTestProject({
      "src/functions/dep-func/index.ts": "export default {}",
    });
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["deploy", "dep-func"], projectRoot);

    expect(bundleFunctionSpy).toHaveBeenCalledTimes(1);
    expect(deployToCloudflareSpy).toHaveBeenCalledTimes(1);
  });

  it('routes "logs" to function logs', async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["logs", "log-func"], projectRoot);

    expect(getCloudflareLogsSpy).toHaveBeenCalledTimes(1);
  });

  it("shows help for unknown action", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["unknown-action"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Unknown function action: unknown-action");
    expect(output).toContain("Available commands:");
    expect(output).toContain("bb function create <name>");
    expect(output).toContain("bb function dev <name>");
    expect(output).toContain("bb function build <name>");
    expect(output).toContain("bb function list");
    expect(output).toContain("bb function logs <name>");
    expect(output).toContain("bb function deploy <name>");
  });

  it("shows help when no action is provided (empty args)", async () => {
    const project = createTestProject();
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand([], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Unknown function action: undefined");
    expect(output).toContain("Available commands:");
  });

  it("handles deploy with --sync-env flag via routing", async () => {
    const project = createTestProject({
      "src/functions/route-sync/index.ts": "export default {}",
    });
    projectRoot = project.root;

    captured = captureConsole();
    await runFunctionCommand(["deploy", "route-sync", "--sync-env"], projectRoot);

    expect(bundleFunctionSpy).toHaveBeenCalledTimes(1);
    expect(deployToCloudflareSpy).toHaveBeenCalledTimes(1);
    // --sync-env calls syncEnvToCloudflare only if config.env has entries
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// stopAllFunctions
// ═══════════════════════════════════════════════════════════════════════════════

describe("stopAllFunctions", () => {
  it("completes without error when no functions are running", async () => {
    captured = captureConsole();
    await stopAllFunctions();
    // Should not throw, should not log anything
  });

  it("does not throw on subsequent calls", async () => {
    await stopAllFunctions();
    await stopAllFunctions();
    await stopAllFunctions();
    // No errors after multiple calls
  });
});
