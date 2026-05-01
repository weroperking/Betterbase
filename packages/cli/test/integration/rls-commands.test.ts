/**
 * RLS Commands — Integration Behavioral Tests
 *
 * Tests for cli/src/commands/rls.ts functions.
 * All functions work with filesystem only — no network/DB needed.
 * Replaces the 17 stub tests from test/rls-commands.test.ts.
 */

import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestProject } from "../fixtures/fixtures";

// ── Dynamically import module under test ─────────────────────────────────────

const { runRlsCreate, runRlsList, runRlsDisable, runRlsCommand } = await import(
  "../../src/commands/rls"
);

// ── Console capture helper ───────────────────────────────────────────────────

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

// ── State ────────────────────────────────────────────────────────────────────

let projectRoot: string | undefined;
let cleanup: (() => void) | undefined;
let captured: ReturnType<typeof captureConsole> | undefined;
let originalCwd: string;

originalCwd = process.cwd();

afterEach(() => {
  captured?.restore();
  captured = undefined;
  if (cleanup) {
    try {
      cleanup();
    } catch {
      /* ignore */
    }
    cleanup = undefined;
  }
  projectRoot = undefined;
  process.chdir(originalCwd);
});

afterAll(() => {
  mock.restore();
});

function setupTestProject(files?: Record<string, string>) {
  const proj = createTestProject(files);
  projectRoot = proj.root;
  cleanup = proj.cleanup;
  process.chdir(proj.root);
}

// ═══════════════════════════════════════════════════════════════════════════════
// runRlsCreate
// ═══════════════════════════════════════════════════════════════════════════════

describe("runRlsCreate", () => {
  it("creates a .policy.ts file with correct template", async () => {
    setupTestProject();
    captured = captureConsole();

    await runRlsCreate("users");

    const policyPath = join(projectRoot!, "src", "db", "policies", "users.policy.ts");
    expect(existsSync(policyPath)).toBe(true);

    const content = readFileSync(policyPath, "utf-8");
    expect(content).toContain("@betterbase/core/rls");
    expect(content).toContain("definePolicy('users'");
    expect(content).toContain("select: \"auth.uid() = user_id\"");
    expect(content).toContain("insert: \"auth.uid() = user_id\"");
    expect(content).toContain("update: \"auth.uid() = user_id\"");
    expect(content).toContain("delete: \"auth.uid() = user_id\"");

    const output = captured.lines.join("\n");
    expect(output).toContain("Created policy file:");
    expect(output).toContain("users.policy.ts");
    expect(output).toContain("Edit this file to configure your RLS policy");
    expect(output).toContain("bb migrate");
  });

  it("sanitizes table name (special chars → underscores)", async () => {
    setupTestProject();
    captured = captureConsole();

    await runRlsCreate("my-table@with!special#chars");

    const policyPath = join(projectRoot!, "src", "db", "policies", "my_table_with_special_chars.policy.ts");
    expect(existsSync(policyPath)).toBe(true);

    const content = readFileSync(policyPath, "utf-8");
    expect(content).toContain("definePolicy('my_table_with_special_chars'");

    const output = captured.lines.join("\n");
    expect(output).toContain("Created policy file:");
    expect(output).toContain("my_table_with_special_chars.policy.ts");
  });

  it("sanitizes table name with spaces", async () => {
    setupTestProject();
    captured = captureConsole();

    await runRlsCreate("user accounts");

    const policyPath = join(projectRoot!, "src", "db", "policies", "user_accounts.policy.ts");
    expect(existsSync(policyPath)).toBe(true);

    const content = readFileSync(policyPath, "utf-8");
    expect(content).toContain("definePolicy('user_accounts'");
  });

  it("warns on duplicate policy", async () => {
    setupTestProject();
    // Create the policy file first
    const policiesDir = join(projectRoot!, "src", "db", "policies");
    mkdirSync(policiesDir, { recursive: true });
    writeFileSync(join(policiesDir, "users.policy.ts"), "// existing policy");

    captured = captureConsole();

    await runRlsCreate("users");

    // File content should NOT be overwritten
    const content = readFileSync(join(policiesDir, "users.policy.ts"), "utf-8");
    expect(content).toBe("// existing policy");

    const output = captured.lines.join("\n");
    expect(output).toContain("Policy file already exists");
    expect(output).toContain("users.policy.ts");
    expect(output).toContain("bb rls disable");
    // Should NOT show "Created policy file"
    expect(output).not.toContain("Created policy file");
  });

  it("throws on missing table name (empty string)", async () => {
    setupTestProject();
    captured = captureConsole();

    await expect(runRlsCreate("")).rejects.toThrow(
      "Table name is required. Usage: bb rls create <table>",
    );
  });

  it("throws on missing table name (undefined)", async () => {
    setupTestProject();
    captured = captureConsole();

    await expect(runRlsCreate(undefined as unknown as string)).rejects.toThrow(
      "Table name is required. Usage: bb rls create <table>",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runRlsList
// ═══════════════════════════════════════════════════════════════════════════════

describe("runRlsList", () => {
  it("lists multiple policies", async () => {
    setupTestProject();
    // Create multiple policy files
    const policiesDir = join(projectRoot!, "src", "db", "policies");
    mkdirSync(policiesDir, { recursive: true });
    writeFileSync(join(policiesDir, "users.policy.ts"), "// users policy");
    writeFileSync(join(policiesDir, "posts.policy.ts"), "// posts policy");
    writeFileSync(join(policiesDir, "comments.policy.ts"), "// comments policy");

    captured = captureConsole();

    await runRlsList();

    const output = captured.lines.join("\n");
    expect(output).toContain("RLS Policies");
    expect(output).toContain("Table");
    expect(output).toContain("File");
    // Table names appear in the listing
    expect(output).toContain("users");
    expect(output).toContain("posts");
    expect(output).toContain("comments");
    // File names appear
    expect(output).toContain("users.policy.ts");
    expect(output).toContain("posts.policy.ts");
    expect(output).toContain("comments.policy.ts");
  });

  it("displays correct count", async () => {
    setupTestProject();
    const policiesDir = join(projectRoot!, "src", "db", "policies");
    mkdirSync(policiesDir, { recursive: true });
    writeFileSync(join(policiesDir, "users.policy.ts"), "// users");
    writeFileSync(join(policiesDir, "posts.policy.ts"), "// posts");

    captured = captureConsole();

    await runRlsList();

    const output = captured.lines.join("\n");
    expect(output).toContain("Total: 2 policy file(s)");
  });

  it("handles empty/no policies directory", async () => {
    setupTestProject();

    captured = captureConsole();

    await runRlsList();

    const output = captured.lines.join("\n");
    expect(output).toContain("No RLS policies found");
    expect(output).toContain("bb rls create <table>");
    // Should NOT show table/header
    expect(output).not.toContain("RLS Policies");
  });

  it("handles existing but empty policies directory", async () => {
    setupTestProject();
    const policiesDir = join(projectRoot!, "src", "db", "policies");
    mkdirSync(policiesDir, { recursive: true });

    captured = captureConsole();

    await runRlsList();

    const output = captured.lines.join("\n");
    expect(output).toContain("No RLS policies found");
  });

  it("ignores non-policy files in the directory", async () => {
    setupTestProject();
    const policiesDir = join(projectRoot!, "src", "db", "policies");
    mkdirSync(policiesDir, { recursive: true });
    writeFileSync(join(policiesDir, "README.md"), "# Policies");
    writeFileSync(join(policiesDir, "users.policy.ts"), "// users policy");
    writeFileSync(join(policiesDir, "helpers.ts"), "export const helper = 1;");

    captured = captureConsole();

    await runRlsList();

    const output = captured.lines.join("\n");
    // Only the .policy.ts file should be counted
    expect(output).toContain("Total: 1 policy file(s)");
    expect(output).toContain("users");
    expect(output).toContain("users.policy.ts");
    expect(output).not.toContain("README.md");
    expect(output).not.toContain("helpers.ts");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runRlsDisable
// ═══════════════════════════════════════════════════════════════════════════════

describe("runRlsDisable", () => {
  it("shows delete instructions when policy exists", async () => {
    setupTestProject();
    const policiesDir = join(projectRoot!, "src", "db", "policies");
    mkdirSync(policiesDir, { recursive: true });
    writeFileSync(join(policiesDir, "users.policy.ts"), "// users policy");

    captured = captureConsole();

    await runRlsDisable("users");

    const output = captured.lines.join("\n");
    expect(output).toContain("This will remove ALL RLS policies");
    expect(output).toContain("users");
    expect(output).toContain("To disable RLS:");
    expect(output).toContain("Delete the policy file:");
    expect(output).toContain("users.policy.ts");
    expect(output).toContain("bb migrate");
    expect(output).toContain("ALTER TABLE users DISABLE ROW LEVEL SECURITY");
    expect(output).toContain("DROP POLICY");
  });

  it("handles missing policy (no policy file found)", async () => {
    setupTestProject();

    captured = captureConsole();

    await runRlsDisable("nonexistent_table");

    const output = captured.lines.join("\n");
    expect(output).toContain("This will remove ALL RLS policies");
    expect(output).toContain("nonexistent_table");
    expect(output).toContain("No policy file found for");
    expect(output).toContain("ALTER TABLE nonexistent_table DISABLE ROW LEVEL SECURITY");
    // Should NOT show "Delete the policy file" since there's no file
    expect(output).not.toContain("Delete the policy file:");
    expect(output).not.toContain("bb migrate");
  });

  it("throws on missing table name (empty string)", async () => {
    setupTestProject();
    captured = captureConsole();

    await expect(runRlsDisable("")).rejects.toThrow(
      "Table name is required. Usage: bb rls disable <table>",
    );
  });

  it("throws on missing table name (undefined)", async () => {
    setupTestProject();
    captured = captureConsole();

    await expect(runRlsDisable(undefined as unknown as string)).rejects.toThrow(
      "Table name is required. Usage: bb rls disable <table>",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// runRlsCommand — routing
// ═══════════════════════════════════════════════════════════════════════════════

describe("runRlsCommand", () => {
  it("routes 'create' to runRlsCreate", async () => {
    setupTestProject();
    captured = captureConsole();

    await runRlsCommand(["create", "widgets"]);

    const policyPath = join(projectRoot!, "src", "db", "policies", "widgets.policy.ts");
    expect(existsSync(policyPath)).toBe(true);

    const content = readFileSync(policyPath, "utf-8");
    expect(content).toContain("definePolicy('widgets'");

    const output = captured.lines.join("\n");
    expect(output).toContain("Created policy file:");
  });

  it("routes 'list' to runRlsList", async () => {
    setupTestProject();
    const policiesDir = join(projectRoot!, "src", "db", "policies");
    mkdirSync(policiesDir, { recursive: true });
    writeFileSync(join(policiesDir, "items.policy.ts"), "// items policy");

    captured = captureConsole();

    await runRlsCommand(["list"]);

    const output = captured.lines.join("\n");
    expect(output).toContain("RLS Policies");
    expect(output).toContain("items");
  });

  it("routes 'disable' to runRlsDisable", async () => {
    setupTestProject();
    const policiesDir = join(projectRoot!, "src", "db", "policies");
    mkdirSync(policiesDir, { recursive: true });
    writeFileSync(join(policiesDir, "widgets.policy.ts"), "// widgets policy");

    captured = captureConsole();

    await runRlsCommand(["disable", "widgets"]);

    const output = captured.lines.join("\n");
    expect(output).toContain("To disable RLS:");
    expect(output).toContain("Delete the policy file:");
    expect(output).toContain("widgets.policy.ts");
  });

  it("shows help when no subcommand given (empty array)", async () => {
    setupTestProject();
    captured = captureConsole();

    await runRlsCommand([]);

    const output = captured.lines.join("\n");
    expect(output).toContain("RLS (Row Level Security) Commands");
    expect(output).toContain("bb rls create <table>");
    expect(output).toContain("bb rls list");
    expect(output).toContain("bb rls disable <table>");
  });

  it("shows help for unknown subcommand", async () => {
    setupTestProject();
    captured = captureConsole();

    await runRlsCommand(["unknown"]);

    const output = captured.lines.join("\n");
    expect(output).toContain("RLS (Row Level Security) Commands");
    expect(output).toContain("bb rls create <table>");
    expect(output).toContain("bb rls list");
    expect(output).toContain("bb rls disable <table>");
  });

  it("shows help for undefined subcommand", async () => {
    setupTestProject();
    captured = captureConsole();

    await runRlsCommand([undefined as unknown as string]);

    const output = captured.lines.join("\n");
    expect(output).toContain("RLS (Row Level Security) Commands");
  });
});
