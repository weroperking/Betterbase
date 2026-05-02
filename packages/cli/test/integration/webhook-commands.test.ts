import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Database } from "bun:sqlite";
import { createTestProject } from "../fixtures/fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CONFIG_JS = `
export default {
  project: { name: "test-project" },
  provider: { type: "managed" },
};
`;

function configWithWebhooks(
  webhooks: Array<{
    id: string;
    table: string;
    events: string[];
    url: string;
    secret: string;
    enabled: boolean;
  }>,
): string {
  return `
export default {
  project: { name: "test-project" },
  provider: { type: "managed" },
  webhooks: ${JSON.stringify(webhooks, null, 2)},
};
`;
}

function createProject(files: Record<string, string>): string {
  const root = join(tmpdir(), `bb-webhook-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(root, { recursive: true });
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, relPath);
    mkdirSync(join(absPath, ".."), { recursive: true });
    writeFileSync(absPath, content);
  }
  return root;
}

function cleanupProject(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
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

function createDbDir(root: string, deliveries: DeliverySeed[]): string {
  const dbDir = join(root, ".betterbase");
  mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "dev.db");
  const db = new Database(dbPath);
  db.run(`
    CREATE TABLE IF NOT EXISTS _betterbase_webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
      request_url TEXT NOT NULL,
      request_body TEXT,
      response_code INTEGER,
      response_body TEXT,
      error TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const stmt = db.prepare(
    `INSERT INTO _betterbase_webhook_deliveries
     (id, webhook_id, status, request_url, request_body, response_code, response_body, error, attempt_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const d of deliveries) {
    stmt.run(d.id, d.webhook_id, d.status, d.request_url ?? "https://example.com/webhook", d.request_body ?? null, d.response_code ?? null, d.response_body ?? null, d.error ?? null, d.attempt_count ?? 1, d.created_at);
  }
  db.close();
  return root;
}

interface DeliverySeed {
  id: string;
  webhook_id: string;
  status: "success" | "failed" | "pending";
  request_url?: string;
  response_code?: number;
  response_body?: string;
  request_body?: string;
  error?: string;
  attempt_count?: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("runWebhookListCommand", () => {
  let projectRoot: string;
  let captured: ReturnType<typeof captureConsole>;

  afterEach(() => {
    captured?.restore();
    if (projectRoot) cleanupProject(projectRoot);
    delete process.env.WEBHOOK_USERS_URL;
    delete process.env.WEBHOOK_SECRET;
    delete process.env.WEBHOOK_ORDERS_URL;
    delete process.env.WEBHOOK_ORDERS_SECRET;
  });

  it("lists all configured webhooks from the config", async () => {
    projectRoot = createProject({
      "betterbase.config.js": configWithWebhooks([
        {
          id: "webhook-abc123",
          table: "users",
          events: ["INSERT", "UPDATE"],
          url: "process.env.WEBHOOK_USERS_URL",
          secret: "process.env.WEBHOOK_SECRET",
          enabled: true,
        },
        {
          id: "webhook-def456",
          table: "orders",
          events: ["INSERT", "UPDATE", "DELETE"],
          url: "process.env.WEBHOOK_ORDERS_URL",
          secret: "process.env.WEBHOOK_ORDERS_SECRET",
          enabled: true,
        },
      ]),
    });

    captured = captureConsole();
    const { runWebhookListCommand } = await import("../../src/commands/webhook");
    await runWebhookListCommand(projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Webhooks");
    expect(output).toContain("webhook-abc123");
    expect(output).toContain("webhook-def456");
    expect(output).toContain("users");
    expect(output).toContain("orders");
    // Header columns are present
    expect(output).toContain("ID");
    expect(output).toContain("Table");
    expect(output).toContain("Events");
    expect(output).toContain("Status");
  });

  it("shows message when no webhooks are configured", async () => {
    projectRoot = createProject({
      "betterbase.config.js": VALID_CONFIG_JS,
    });

    captured = captureConsole();
    const { runWebhookListCommand } = await import("../../src/commands/webhook");
    await runWebhookListCommand(projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("No webhooks configured");
  });

  it("shows disabled webhooks with correct status label", async () => {
    projectRoot = createProject({
      "betterbase.config.js": configWithWebhooks([
        {
          id: "webhook-abc123",
          table: "users",
          events: ["INSERT", "UPDATE"],
          url: "process.env.WEBHOOK_USERS_URL",
          secret: "process.env.WEBHOOK_SECRET",
          enabled: false,
        },
      ]),
    });

    captured = captureConsole();
    const { runWebhookListCommand } = await import("../../src/commands/webhook");
    await runWebhookListCommand(projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("webhook-abc123");
    expect(output).toContain("disabled");
  });

  it("shows event types comma separated", async () => {
    projectRoot = createProject({
      "betterbase.config.js": configWithWebhooks([
        {
          id: "webhook-abc123",
          table: "users",
          events: ["INSERT", "UPDATE", "DELETE"],
          url: "process.env.WEBHOOK_USERS_URL",
          secret: "process.env.WEBHOOK_SECRET",
          enabled: true,
        },
      ]),
    });

    captured = captureConsole();
    const { runWebhookListCommand } = await import("../../src/commands/webhook");
    await runWebhookListCommand(projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("INSERT");
    expect(output).toContain("UPDATE");
    expect(output).toContain("DELETE");
  });

  it("returns early when config is missing", async () => {
    // No config file at all
    projectRoot = createProject({});

    captured = captureConsole();
    const { runWebhookListCommand } = await import("../../src/commands/webhook");
    await runWebhookListCommand(projectRoot);

    // Should not throw; simply returns with no output (or a warning from loadConfig)
    // Verify the function does not produce the Webhooks header
    const output = captured.lines.join("\n");
    expect(output).not.toContain("Webhooks");
  });
});

describe("runWebhookTestCommand", () => {
  let projectRoot: string;
  let captured: ReturnType<typeof captureConsole>;

  afterEach(() => {
    captured?.restore();
    mock.restore();
    if (projectRoot) cleanupProject(projectRoot);
    delete process.env.WEBHOOK_USERS_URL;
    delete process.env.WEBHOOK_SECRET;
  });

  it("errors when webhook ID is not found in config", async () => {
    projectRoot = createProject({
      "betterbase.config.js": configWithWebhooks([
        {
          id: "webhook-existing",
          table: "users",
          events: ["INSERT"],
          url: "process.env.WEBHOOK_USERS_URL",
          secret: "process.env.WEBHOOK_SECRET",
          enabled: true,
        },
      ]),
    });

    captured = captureConsole();
    const { runWebhookTestCommand } = await import("../../src/commands/webhook");
    await runWebhookTestCommand(projectRoot, "webhook-nonexistent");

    const output = captured.lines.join("\n");
    expect(output).toContain("Webhook not found");
    expect(output).toContain("webhook-nonexistent");
  });

  it("errors when URL environment variable is not set", async () => {
    projectRoot = createProject({
      "betterbase.config.js": configWithWebhooks([
        {
          id: "webhook-test-url",
          table: "users",
          events: ["INSERT"],
          url: "process.env.WEBHOOK_USERS_URL",
          secret: "process.env.WEBHOOK_SECRET",
          enabled: true,
        },
      ]),
    });

    captured = captureConsole();
    const { runWebhookTestCommand } = await import("../../src/commands/webhook");
    await runWebhookTestCommand(projectRoot, "webhook-test-url");

    const output = captured.lines.join("\n");
    expect(output).toContain("Environment variable not set");
    expect(output).toContain("WEBHOOK_USERS_URL");
  });

  it("errors when secret environment variable is not set", async () => {
    projectRoot = createProject({
      "betterbase.config.js": configWithWebhooks([
        {
          id: "webhook-test-secret",
          table: "users",
          events: ["INSERT"],
          url: "process.env.WEBHOOK_USERS_URL",
          secret: "process.env.WEBHOOK_SECRET",
          enabled: true,
        },
      ]),
    });
    process.env.WEBHOOK_USERS_URL = "https://example.com/webhook";
    // WEBHOOK_SECRET is intentionally NOT set

    captured = captureConsole();
    const { runWebhookTestCommand } = await import("../../src/commands/webhook");
    await runWebhookTestCommand(projectRoot, "webhook-test-secret");

    const output = captured.lines.join("\n");
    expect(output).toContain("Environment variable not set");
    expect(output).toContain("WEBHOOK_SECRET");
  });

  it("config validation rejects URLs and secrets not using env var references", async () => {
    // The zod schema enforces that url and secret must start with "process.env."
    // loadConfig returns null when validation fails, and the test command returns early.
    projectRoot = createProject({
      "betterbase.config.js": `
export default {
  project: { name: "test-project" },
  provider: { type: "managed" },
  webhooks: [
    {
      id: "webhook-bad",
      table: "users",
      events: ["INSERT"],
      url: "https://hardcoded.example.com",
      secret: "hardcoded-secret",
      enabled: true,
    },
  ],
};
`,
    });

    captured = captureConsole();
    const { runWebhookTestCommand } = await import("../../src/commands/webhook");
    await runWebhookTestCommand(projectRoot, "webhook-bad");

    const output = captured.lines.join("\n");
    // loadConfig warns about the schema validation failure
    expect(output).toContain("Config validation");
    expect(output).toContain("environment variable reference");
  });

  it("sends a test payload when all env vars are set", async () => {
    // Mock WebhookDispatcher BEFORE importing the webhook module
    mock.module("@betterbase/core/webhooks", () => ({
      WebhookDispatcher: class {
        constructor(_configs: unknown[]) {}
        testWebhook = async () => ({
          success: true,
          status_code: 200,
          response_body: "ok",
        });
      },
    }));

    projectRoot = createProject({
      "betterbase.config.js": configWithWebhooks([
        {
          id: "webhook-ok",
          table: "users",
          events: ["INSERT", "UPDATE"],
          url: "process.env.WEBHOOK_USERS_URL",
          secret: "process.env.WEBHOOK_SECRET",
          enabled: true,
        },
      ]),
    });
    process.env.WEBHOOK_USERS_URL = "https://example.com/webhook";
    process.env.WEBHOOK_SECRET = "my-secret-token";

    captured = captureConsole();
    const { runWebhookTestCommand } = await import("../../src/commands/webhook");
    await runWebhookTestCommand(projectRoot, "webhook-ok");

    const output = captured.lines.join("\n");
    expect(output).toContain("Testing webhook");
    expect(output).toContain("webhook-ok");
    expect(output).toContain("https://example.com/webhook");
    expect(output).toContain("Webhook test succeeded");
  });

  it("reports failure when test webhook returns success: false", async () => {
    mock.module("@betterbase/core/webhooks", () => ({
      WebhookDispatcher: class {
        constructor(_configs: unknown[]) {}
        testWebhook = async () => ({
          success: false,
          status_code: 500,
          response_body: "Internal Server Error",
          error: "timeout",
        });
      },
    }));

    projectRoot = createProject({
      "betterbase.config.js": configWithWebhooks([
        {
          id: "webhook-fail",
          table: "users",
          events: ["INSERT"],
          url: "process.env.WEBHOOK_USERS_URL",
          secret: "process.env.WEBHOOK_SECRET",
          enabled: true,
        },
      ]),
    });
    process.env.WEBHOOK_USERS_URL = "https://example.com/webhook";
    process.env.WEBHOOK_SECRET = "my-secret-token";

    captured = captureConsole();
    const { runWebhookTestCommand } = await import("../../src/commands/webhook");
    await runWebhookTestCommand(projectRoot, "webhook-fail");

    const output = captured.lines.join("\n");
    expect(output).toContain("Webhook test failed");
    expect(output).toContain("500");
    expect(output).toContain("timeout");
  });
});

describe("runWebhookLogsCommand", () => {
  let projectRoot: string;
  let captured: ReturnType<typeof captureConsole>;

  afterEach(() => {
    captured?.restore();
    if (projectRoot) cleanupProject(projectRoot);
    delete process.env.WEBHOOK_USERS_URL;
    delete process.env.WEBHOOK_SECRET;
  });

  it("displays delivery logs from the local database", async () => {
    projectRoot = createDbDir(
      createProject({
        "betterbase.config.js": configWithWebhooks([
          {
            id: "webhook-logs-test",
            table: "users",
            events: ["INSERT", "UPDATE"],
            url: "process.env.WEBHOOK_USERS_URL",
            secret: "process.env.WEBHOOK_SECRET",
            enabled: true,
          },
        ]),
      }),
      [
        {
          id: "delivery-001",
          webhook_id: "webhook-logs-test",
          status: "success",
          response_code: 200,
          created_at: "2025-01-15T10:30:00Z",
        },
        {
          id: "delivery-002",
          webhook_id: "webhook-logs-test",
          status: "failed",
          response_code: 500,
          error: "timeout",
          created_at: "2025-01-15T10:31:00Z",
        },
      ],
    );

    captured = captureConsole();
    const { runWebhookLogsCommand } = await import("../../src/commands/webhook");
    await runWebhookLogsCommand(projectRoot, "webhook-logs-test");

    const output = captured.lines.join("\n");
    expect(output).toContain("Webhook");
    expect(output).toContain("webhook-logs-test");
    expect(output).toContain("Delivery Logs");
    expect(output).toContain("success");
    expect(output).toContain("failed");
    expect(output).toContain("Total:");
  });

  it("shows message when no delivery logs exist", async () => {
    projectRoot = createDbDir(
      createProject({
        "betterbase.config.js": configWithWebhooks([
          {
            id: "webhook-empty-logs",
            table: "users",
            events: ["INSERT"],
            url: "process.env.WEBHOOK_USERS_URL",
            secret: "process.env.WEBHOOK_SECRET",
            enabled: true,
          },
        ]),
      }),
      [], // No deliveries
    );

    captured = captureConsole();
    const { runWebhookLogsCommand } = await import("../../src/commands/webhook");
    await runWebhookLogsCommand(projectRoot, "webhook-empty-logs");

    const output = captured.lines.join("\n");
    expect(output).toContain("No delivery logs found");
  });

  it("shows error when the database file does not exist", async () => {
    projectRoot = createProject({
      "betterbase.config.js": configWithWebhooks([
        {
          id: "webhook-nodb",
          table: "users",
          events: ["INSERT"],
          url: "process.env.WEBHOOK_USERS_URL",
          secret: "process.env.WEBHOOK_SECRET",
          enabled: true,
        },
      ]),
    });

    captured = captureConsole();
    const { runWebhookLogsCommand } = await import("../../src/commands/webhook");
    await runWebhookLogsCommand(projectRoot, "webhook-nodb");

    const output = captured.lines.join("\n");
    expect(output).toContain("No local database found");
  });

  it("errors when webhook ID is not found", async () => {
    projectRoot = createProject({
      "betterbase.config.js": configWithWebhooks([
        {
          id: "webhook-known",
          table: "users",
          events: ["INSERT"],
          url: "process.env.WEBHOOK_USERS_URL",
          secret: "process.env.WEBHOOK_SECRET",
          enabled: true,
        },
      ]),
    });

    captured = captureConsole();
    const { runWebhookLogsCommand } = await import("../../src/commands/webhook");
    await runWebhookLogsCommand(projectRoot, "webhook-unknown");

    const output = captured.lines.join("\n");
    expect(output).toContain("Webhook not found");
    expect(output).toContain("webhook-unknown");
  });

  it("respects the limit option when querying logs", async () => {
    projectRoot = createDbDir(
      createProject({
        "betterbase.config.js": configWithWebhooks([
          {
            id: "webhook-limit-test",
            table: "users",
            events: ["INSERT"],
            url: "process.env.WEBHOOK_USERS_URL",
            secret: "process.env.WEBHOOK_SECRET",
            enabled: true,
          },
        ]),
      }),
      [
        { id: "d-1", webhook_id: "webhook-limit-test", status: "success", response_code: 200, created_at: "2025-01-15T10:30:00Z" },
        { id: "d-2", webhook_id: "webhook-limit-test", status: "success", response_code: 200, created_at: "2025-01-15T10:31:00Z" },
        { id: "d-3", webhook_id: "webhook-limit-test", status: "success", response_code: 200, created_at: "2025-01-15T10:32:00Z" },
        { id: "d-4", webhook_id: "webhook-limit-test", status: "success", response_code: 200, created_at: "2025-01-15T10:33:00Z" },
        { id: "d-5", webhook_id: "webhook-limit-test", status: "success", response_code: 200, created_at: "2025-01-15T10:34:00Z" },
      ],
    );

    captured = captureConsole();
    const { runWebhookLogsCommand } = await import("../../src/commands/webhook");
    await runWebhookLogsCommand(projectRoot, "webhook-limit-test", { limit: 3 });

    const output = captured.lines.join("\n");
    expect(output).toContain("Limit");
    expect(output).toContain("3");
    expect(output).toContain("Total: 3");
  });
});

describe("runWebhookCommand routing", () => {
  let projectRoot: string;
  let captured: ReturnType<typeof captureConsole>;

  afterEach(() => {
    captured?.restore();
    mock.restore();
    if (projectRoot) cleanupProject(projectRoot);
  });

  it("routes 'list' to list command and shows webhooks", async () => {
    projectRoot = createProject({
      "betterbase.config.js": configWithWebhooks([
        {
          id: "wh-list",
          table: "users",
          events: ["INSERT"],
          url: "process.env.WEBHOOK_USERS_URL",
          secret: "process.env.WEBHOOK_SECRET",
          enabled: true,
        },
      ]),
    });

    captured = captureConsole();
    const { runWebhookCommand } = await import("../../src/commands/webhook");
    await runWebhookCommand(["list"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Webhooks");
    expect(output).toContain("wh-list");
  });

  it("routes 'test' to test command", async () => {
    projectRoot = createProject({
      "betterbase.config.js": configWithWebhooks([
        {
          id: "webhook-routing-test",
          table: "users",
          events: ["INSERT"],
          url: "process.env.WEBHOOK_USERS_URL",
          secret: "process.env.WEBHOOK_SECRET",
          enabled: true,
        },
      ]),
    });

    captured = captureConsole();
    const { runWebhookCommand } = await import("../../src/commands/webhook");
    await runWebhookCommand(["test", "webhook-nonexistent"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Webhook not found");
  });

  it("routes 'logs' to logs command", async () => {
    projectRoot = createProject({
      "betterbase.config.js": configWithWebhooks([
        {
          id: "webhook-routing-logs",
          table: "users",
          events: ["INSERT"],
          url: "process.env.WEBHOOK_USERS_URL",
          secret: "process.env.WEBHOOK_SECRET",
          enabled: true,
        },
      ]),
    });

    captured = captureConsole();
    const { runWebhookCommand } = await import("../../src/commands/webhook");
    await runWebhookCommand(["logs", "webhook-unknown"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Webhook not found");
  });

  it("shows help when no subcommand is provided", async () => {
    projectRoot = createProject({
      "betterbase.config.js": VALID_CONFIG_JS,
    });

    captured = captureConsole();
    const { runWebhookCommand } = await import("../../src/commands/webhook");
    await runWebhookCommand([], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("BetterBase Webhook Commands");
    expect(output).toContain("create");
    expect(output).toContain("list");
    expect(output).toContain("test <id>");
    expect(output).toContain("logs <id>");
  });

  it("shows usage error when 'test' has no webhook ID", async () => {
    projectRoot = createProject({
      "betterbase.config.js": VALID_CONFIG_JS,
    });

    captured = captureConsole();
    const { runWebhookCommand } = await import("../../src/commands/webhook");
    await runWebhookCommand(["test"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Usage: bb webhook test <webhook-id>");
  });

  it("shows usage error when 'logs' has no webhook ID", async () => {
    projectRoot = createProject({
      "betterbase.config.js": VALID_CONFIG_JS,
    });

    captured = captureConsole();
    const { runWebhookCommand } = await import("../../src/commands/webhook");
    await runWebhookCommand(["logs"], projectRoot);

    const output = captured.lines.join("\n");
    expect(output).toContain("Usage: bb webhook logs <webhook-id>");
  });
});

describe("generateWebhookId via runWebhookCreateCommand", () => {
  let captured: ReturnType<typeof captureConsole>;

  it("creates a webhook ID with correct prefix and logs it", async () => {
    const t = createTestProject({
      "betterbase.config.js": VALID_CONFIG_JS,
    });
    captured = captureConsole();

    try {
      const { runWebhookCreateCommand } = await import("../../src/commands/webhook");
      await runWebhookCreateCommand(t.root);

      const output = captured.lines.join("\n");
      // Should contain success message with webhook ID
      expect(output).toMatch(/Webhook created with ID:\s+webhook-[0-9a-z]+/);
      expect(output).toContain("Webhook created");
    } finally {
      captured.restore();
      cleanupProject(t.root);
    }
  });

  it("produces unique IDs across calls", async () => {
    const ids: string[] = [];

    for (let i = 0; i < 2; i++) {
      captured = captureConsole();
      const t = createTestProject({ "betterbase.config.js": VALID_CONFIG_JS });
      try {
        const { runWebhookCreateCommand } = await import("../../src/commands/webhook");
        await runWebhookCreateCommand(t.root);
        const output = captured.lines.join("\n");
        const match = output.match(/webhook-[0-9a-z]+/);
        expect(match).not.toBeNull();
        ids.push(match![0]);
      } finally {
        captured.restore();
        cleanupProject(t.root);
      }
      await new Promise(r => setTimeout(r, 10));
    }

    expect(ids[0]).not.toBe(ids[1]);
    // Later timestamp produces lexicographically greater suffix
    const suffix0 = ids[0].replace("webhook-", "");
    const suffix1 = ids[1].replace("webhook-", "");
    expect(suffix1.localeCompare(suffix0)).toBeGreaterThan(0);
  });

  it("IDs are monotonically increasing with time", async () => {
    const ids: string[] = [];

    for (let i = 0; i < 2; i++) {
      captured = captureConsole();
      const t = createTestProject({ "betterbase.config.js": VALID_CONFIG_JS });
      try {
        const { runWebhookCreateCommand } = await import("../../src/commands/webhook");
        await runWebhookCreateCommand(t.root);
        const output = captured.lines.join("\n");
        const match = output.match(/webhook-[0-9a-z]+/);
        expect(match).not.toBeNull();
        ids.push(match![0]);
      } finally {
        captured.restore();
        cleanupProject(t.root);
      }
      await new Promise(r => setTimeout(r, 10));
    }

    // Later timestamp produces lexicographically greater suffix
    const suffix0 = ids[0].replace("webhook-", "");
    const suffix1 = ids[1].replace("webhook-", "");
    expect(suffix1.localeCompare(suffix0)).toBeGreaterThan(0);
  });
});

describe("runWebhookCreateCommand helpers", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) cleanupProject(projectRoot);
  });

  it("returns early when config file does not exist", async () => {
    projectRoot = createProject({});
    captured = captureConsole();

    const { runWebhookCreateCommand } = await import("../../src/commands/webhook");

    try {
      await runWebhookCreateCommand(projectRoot);
    } finally {
      captured.restore();
    }

    const output = captured.lines.join("\n");
    expect(output).toContain("Could not load config");
  });
});
