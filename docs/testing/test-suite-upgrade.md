# BetterBase Comprehensive Test Suite Upgrade

## 1) Objective (final outcome)

Deliver a **production-grade test suite** for the BetterBase CLI (`@betterbase/cli`) that:

- Replaces 31% meaningful coverage with **90%+ behavioral coverage** across all command modules
- Eliminates 8 stub files (every assertion is `expect(true).toBe(true)`) and 3 skeleton files (type checks only)
- Adds **integration tests against a real SQLite database** for data-dependent commands
- Adds **CLI argument parsing regression tests** that feed real argv arrays into Commander
- Adds **output format snapshot tests** to catch silent formatting regressions
- Adds **credential and auth lifecycle tests** covering the entire login→authenticated call path
- Establishes **shared test fixtures and harnesses** reusable across all command test files

---

## 2) Scope map (what is covered)

### Included (packages/cli — the `bb` command)

| Layer | Files | Current State |
|-------|-------|---------------|
| Entry point / Commander wiring | `src/index.ts` | Smoke test only (checks command names exist) |
| Auth & credentials | `src/commands/login.ts`, `src/utils/credentials.ts`, `src/utils/api-client.ts` | **Zero coverage** — 16 stubs |
| Config loading utilities | `src/utils/config.ts` (new shared utility) | **Zero coverage** |
| All command modules | `src/commands/*.ts` (14 subcommands + IAC submodules) | 10 of 22 command files have meaningful tests |
| Dev infrastructure | `src/commands/dev.ts`, `src/commands/dev/*.ts` | Skeleton only (checks dir exists) |
| Utilities | `src/utils/*.ts` | Partial (logger, prompts, scanner tested; spinner, credentials, api-client untested) |

### Excluded from this phase

- `packages/core/` — Core SDK has its own test regime (not CLI's responsibility)
- `packages/server/` — Server package tested separately
- `packages/client/` — Client SDK tested separately
- `apps/dashboard/` — Frontend tested separately
- `templates/` — Template projects are not individually tested

---

## 3) Current state assessment

### 3.1 Overall health

| Metric | Value |
|--------|-------|
| Total test files | 26 |
| Files with real assertions (Good) | 8 (31%) |
| Files partially tested | 7 (27%) |
| Skeleton files (barely tests anything) | 3 (12%) |
| Stub files (`expect(true).toBe(true)`) | 8 (31%) |
| Source files with any meaningful coverage | 10 of ~37 (27%) |
| Test-to-source ratio | Meaningful tests cover only happy-path of 10 files |

### 3.2 Per-file quality matrix

#### Tier 1 — Good (keep as-is, add edge cases)

| File | What It Tests | Quality Notes |
|------|--------------|---------------|
| `migrate-utils.test.ts` | `calculateChecksum`, `parseMigrationFilename`, `getDatabaseType`, `getMigrationsTableSql` | Full coverage of all 4 exports. Determinism, edge cases, env var save/restore. |
| `migrate.test.ts` | `splitStatements`, `analyzeMigration` | Full coverage. Quoted semicolons, case-insensitive, IF NOT EXISTS variants. |
| `prompts.test.ts` | `prompts.text`, `prompts.confirm`, `prompts.select` | Good edge cases. Empty validation, invalid defaults. |
| `provider-prompts.test.ts` | `generateEnvContent`, `generateEnvExampleContent` | Full string content assertions across all providers. |
| `migrate-from-convex.test.ts` | `runMigrateFromConvex` | Validates JSON report structure, compatibility blockers, severity levels. |
| `context-generator.test.ts` | `ContextGenerator.generate()` | Tests full/missing/empty schema and routes. Validates persisted JSON. |
| `generate-crud.test.ts` | `runGenerateCrudCommand` | Scaffolds temp project, validates file content, error cases. |
| `edge-cases.test.ts` | SchemaScanner, RouteScanner, ContextGenerator with malformed inputs | Good edge coverage: empty files, syntax errors, long names, deeply nested code. |

#### Tier 2 — Partial (expand scope)

| File | Current Coverage | Missing |
|------|-----------------|---------|
| `auth-command.test.ts` | `runAuthSetupCommand` only | `runAuthAddProviderCommand` has zero coverage |
| `route-scanner.test.ts` | 1 scenario (GET + POST with auth) | Need: PATCH/DELETE, no-auth routes, malformed decorators, nested route groups |
| `scanner.test.ts` | 1 scenario (3 tables) | Need: empty tables, no relations, circular FK, array columns, enums |
| `logger.test.ts` | "doesn't crash" only | Need: actual stderr/stdout capture, format verification, unicode boundary tests |
| `error-messages.test.ts` | String content of simulated errors | Need: exercise actual error-producing code paths, not mock strings |
| `graphql-type-map.test.ts` | 28 tests BUT duplicates the function locally | Fix: import `drizzleTypeToGraphQL` from `src/commands/graphql.ts` |
| `iac-commands.test.ts` | Mock literals only | Fix: import and exercise `runIacAnalyze`, `runIacExport`, `runIacImport` |
| `smoke.test.ts` | Checks command names exist | Expand: verify full subcommand tree, option names, help text content |

#### Tier 3 — Skeleton (rewrite completely)

| File | What It Does Now | What It Should Do |
|------|-----------------|-------------------|
| `dev.test.ts` | Creates/deletes temp dirs | Start dev server, verify it boots, send HTTP request, test graceful shutdown |
| `init.test.ts` | Checks type shape | Scaffold a real project with `runInitCommand`, verify all expected files exist |
| `login-commands.test.ts` | 16 stubs of `expect(true).toBe(true)` | Test credential save/load, device code flow mock, token validation, logout |

#### Tier 4 — Stub (rewrite from scratch)

These 8 files contain **zero real assertions** against source code:

| File | Stub Count | Will Be Replaced With |
|------|-----------|----------------------|
| `branch-commands.test.ts` | 17 | Config load → branch create/list/delete/sleep/wake lifecycle tests |
| `function-commands.test.ts` | 10 | Function create/dev/build/list/logs/deploy tests |
| `login-commands.test.ts` | 16 | Credential lifecycle + auth flow tests |
| `rls-commands.test.ts` | 13 | Policy create/list/disable tests |
| `rls-test-command.test.ts` | 7 | RLS evaluation with real PostgreSQL schema |
| `storage-commands.test.ts` | 11 | Storage init (prompt flow), bucket list, file upload |
| `webhook-commands.test.ts` | 17 | Webhook create/list/test/logs lifecycle tests |
| `auth-commands.test.ts` | 9 | (Merged into auth-command.test.ts — this file is redundant) |

---

## 4) Source files with zero test coverage

| Source File | Reason Untested | Priority |
|-------------|----------------|----------|
| `src/commands/webhook.ts` | Stub file only | P0 |
| `src/commands/branch.ts` | Stub file only | P0 |
| `src/commands/rls-test.ts` | Stub file only | P1 |
| `src/commands/login.ts` | Stub file only | P0 |
| `src/commands/storage.ts` | Stub file only | P1 |
| `src/commands/rls.ts` | Stub file only | P1 |
| `src/commands/function.ts` | Stub file only | P0 |
| `src/commands/graphql.ts` | `graphql-type-map.test.ts` duplicates the function — doesn't import source | P2 |
| `src/commands/dev.ts` | Skeleton only | P0 |
| `src/commands/init.ts` | Skeleton only | P2 |
| `src/commands/auth.ts` (addProvider) | Only `runAuthSetupCommand` is tested | P1 |
| `src/commands/iac/sync.ts` | Never imported by any test | P1 |
| `src/commands/iac/generate.ts` | Never imported by any test | P1 |
| `src/commands/iac/export.ts` | Stub literals only | P3 |
| `src/commands/iac/import.ts` | Stub literals only | P3 |
| `src/commands/iac/analyze.ts` | Stub literals only | P2 |
| `src/commands/dev/process-manager.ts` | No dev tests | P0 |
| `src/commands/dev/watcher.ts` | No dev tests | P0 |
| `src/commands/dev/error-formatter.ts` | No dev tests | P2 |
| `src/commands/dev/query-log.ts` | No dev tests | P3 |
| `src/commands/auth-providers.ts` | Only called internally by `auth.ts` | P2 |
| `src/utils/api-client.ts` | Credentials/network dependency | P0 |
| `src/utils/credentials.ts` | File I/O never tested | P0 |
| `src/utils/config.ts` | New shared utility, untested | P0 |
| `src/utils/spinner.ts` | Never tested | P3 |
| `src/build.ts` | Build script | P3 |

---

## 5) Categories of testing that are completely absent

### 5.1 Authentication/credential lifecycle (P0)

**Impact:** Every authenticated command path is untestable.

The entire login flow (`bb login`, `bb login --email`, device code OAuth, API key login, token storage, `isAuthenticated`, `clearCredentials`, credential file read/write with Zod schema validation) has zero test coverage. The `api-client.ts` module (the authenticated `apiRequest()` wrapper called by `branch.ts`, `webhook.ts`, `storage.ts`, `function.ts`) is also untested.

**What's needed:**
- Unit tests for `saveCredentials` / `loadCredentials` / `clearCredentials` against temp `~/.betterbase/credentials.json`
- Unit tests for Zod credential schema validation (corrupt JSON, missing fields, expired timestamps)
- Unit tests for `isAuthenticated` with present/absent/expired credentials
- Mocked fetch tests for `runLoginCommand` device code flow (device/code → device/token → admin/auth/me)
- Mocked fetch tests for `runApiKeyLogin` admin/auth/login flow
- Mocked fetch tests for `apiRequest()` with valid/invalid/expired tokens

### 5.2 CLI argument parsing regression (P0)

**Impact:** No test verifies that Commander correctly parses user input into command functions.

All 14+ subcommands register arguments and options via Commander. Zero tests feed argv arrays into `createProgram().parseAsync()` and assert parsed values.

**What's needed:**
- For each major subcommand, a matrix test that feeds known argv arrays and validates:
  - Required arguments arrive at the correct positional position
  - Optional arguments default to the documented value
  - Boolean flags (`--force`, `--sync-env`, `--dry-run`, `--debug`) parse correctly
  - String/number options (`--output <format>`, `--steps <number>`, `--limit <number>`) parse correctly
  - Unknown commands and missing required args produce Commander errors
  - `--help` output contains expected subcommand descriptions

### 5.3 Output format snapshot tests (P1)

**Impact:** The recent UX polish pass changed output formatting across 15 files. No test verifies the formatted output hasn't regressed.

Commands like `bb migrate preview`, `bb webhook list`, `bb rls list`, `bb branch list`, `bb function list` produce structured terminal output. If a formatting change breaks alignment, color coding, or symbol rendering, no test will catch it.

**What's needed:**
- Capture stdout from command functions (not subprocess — just string output)
- Assert exact format for table headers, column alignment, color codes, logger symbols
- Snapshot approach: save golden output strings, diff on change
- Cover at minimum: migrate preview, webhook list, webhook logs, branch list, function list, rls list, storage list

### 5.4 Config file discovery and validation (P1)

**Impact:** `utils/config.ts` has `findConfigFile`, `loadConfig`, `readConfigFile` — all untested. This single module feeds every command that reads `betterbase.config.ts`.

**What's needed:**
- `findConfigFile` discovers `.ts` / `.js` / `.mts` variants in order
- `loadConfig` correctly parses known-good config files
- `loadConfig` rejects malformed configs with expected Zod error shape
- `loadConfig` handles dynamic `import()` failures gracefully (missing file, syntax error)
- `readConfigFile` returns raw content for config mutation commands

### 5.5 SQLite in-memory integration harness (P2)

**Impact:** Migration commands, webhook log queries, RLS tests, and branch management all operate on database state. No test verifies actual data persistence, query correctness, or schema changes.

**What's needed:**
- A shared test fixture (`test/fixtures/database.ts`) that:
  - Creates a `:memory:` SQLite database
  - Runs a known Drizzle schema (tables, indexes, foreign keys)
  - Inserts seed data
  - Exposes `db` and `schema` for command functions to use
  - Cleans up after each test
- Apply migration SQL and verify table structure changed
- Query webhook delivery logs from a real `_betterbase_webhook_deliveries` table
- Test `getDatabaseConnection` with SQLite and PostgreSQL connection strings

### 5.6 Dev server lifecycle tests (P2)

**Impact:** `bb dev` is the most complex command (ProcessManager, DevWatcher, ContextGenerator, IAC sync/generate orchestration). The existing `dev.test.ts` only checks directory existence.

**What's needed:**
- Start the dev server process, verify it binds to the expected port
- Send an HTTP GET to `localhost:3000/health` and assert 200
- Trigger a file change in `src/db/schema.ts`, verify context regeneration
- Trigger a file change in `betterbase/schema.ts`, verify IAC sync + server restart
- Send SIGTERM and verify graceful shutdown (cleanup called, ports released)
- Verify query log enable/disable via `QUERY_LOG` env var

### 5.7 Webhook lifecycle tests (P2)

**Impact:** `webhook.ts` has 17 stub tests. The webhook create command mutates `betterbase.config.ts` with regex-based string manipulation — highly regression-prone.

**What's needed:**
- Create a webhook entry in a temp config file, verify the config file content
- Add a second webhook, verify both entries exist
- List webhooks from a known config, verify output format
- Test webhook dispatch with mocked `WebhookDispatcher`
- Query webhook delivery logs from SQLite in-memory DB
- Test missing env var error paths (both URL and secret)

### 5.8 Branch management lifecycle tests (P2)

**Impact:** `branch.ts` has 17 stub tests.

**What's needed:**
- Load a known `betterbase.config.ts`, create a branch via `createBranchManager`
- List branches, verify count and metadata
- Delete a branch, verify it's removed from the manager
- Sleep/wake transitions, verify status change
- Status command returns expected shape
- Error paths: missing config file, unknown branch name, duplicate branch name

### 5.9 RLS policy lifecycle tests (P2)

**Impact:** `rls.ts` and `rls-test.ts` have 20 stub tests combined.

**What's needed:**
- Create a policy file for a table, verify file content matches template
- List policy files from a directory
- Disable instruction output verification
- Duplicate policy creation warning
- `runRLSTestCommand` with a real PostgreSQL schema and RLS policies
- Verify test results JSON structure
- Verify cleanup: test schema is dropped after test

### 5.10 Function lifecycle tests (P2)

**Impact:** `function.ts` has 10 stub tests.

**What's needed:**
- Create a function directory, verify generated `index.ts` and `config.ts` content
- List functions from a project directory
- Build a function, verify output bundle exists
- Deploy with mocked `deployToCloudflare` / `deployToVercel`
- Logs command with mocked `getCloudflareLogs` / `getVercelLogs`
- Error paths: duplicate function name, missing function, invalid name characters

### 5.11 Storage bucket lifecycle tests (P2)

**Impact:** `storage.ts` has 11 stub tests.

**What's needed:**
- Storage init: prompt flow verification (provider selection → credential prompts → config file update)
- Config file mutation: verify `betterbase.config.ts` is updated with the correct storage block
- Env file mutation: verify `.env` gets storage credentials
- Gitignore update: verify `.gitignore` gets provider-specific patterns
- List buckets with mocked `createS3Adapter`
- Upload file with mocked adapter, verify public URL generation

### 5.12 IAC workflow integration tests (P3)

**Impact:** `iac/sync.ts`, `iac/generate.ts`, `iac/export.ts`, `iac/import.ts`, `iac/analyze.ts` have no real source imports in tests.

**What's needed:**
- `runIacSync`: load a `betterbase/schema.ts`, compare with serialized schema, verify migration SQL generated
- `runIacGenerate`: discover functions from `betterbase/`, verify `api.d.ts` content
- `runIacAnalyze`: scan query files, verify complexity analysis output
- `runIacExport` / `runIacImport`: verify placeholder output format (until server integration)

### 5.13 Spinner utility tests (P3)

**Impact:** `withSpinner` is used by every command that performs async work. Untested.

**What's needed:**
- `createSpinner` returns configured Ora instance
- `withSpinner` calls task, persists on success
- `withSpinner` catches error, persists with failText, re-throws
- Timer behavior: elapsed time formatting

### 5.14 End-to-end binary tests (P3)

**Impact:** No test spawns the actual compiled `bb` binary.

**What's needed:**
- `bun run dist/index.js --version` → exits 0, stdout contains version
- `bun run dist/index.js --help` → exits 0, stdout contains subcommand list
- `bun run dist/index.js init --help` → exits 0
- `bun run dist/index.js unknown-command` → exits non-zero

### 5.15 GraphQL command tests (P3)

**Impact:** `commands/graphql.ts` is untested. The type-map test duplicates the function rather than importing from source.

**What's needed:**
- Fix `graphql-type-map.test.ts` to import `drizzleTypeToGraphQL` from `src/commands/graphql.ts`
- Test `generateSDL` and `generateServerSetup` with known table inputs
- Test `runGraphqlPlaygroundCommand` with mocked health endpoint and platform-specific open commands
- Test `runGenerateGraphqlCommand` with a real schema file → verify `.graphql` output

---

## 6) Prioritized implementation plan

### Phase 1: Foundation (P0 — weeks 1-2)

**Goal:** Unlock testing of all authenticated commands and config-dependent paths.

| # | Task | Effort | Depends On |
|---|------|--------|------------|
| 1.1 | Create shared test fixtures module (`test/fixtures.ts`) with temp directory scaffolding, schema file generators, config file generators | Medium | — |
| 1.2 | Create shared SQLite in-memory harness (`test/fixtures/database.ts`) | Medium | 1.1 |
| 1.3 | Write `credentials.test.ts` (save, load, clear, corrupt file, expired token, Zod validation) | Small | 1.1 |
| 1.4 | Write `api-client.test.ts` with mocked fetch (valid token, expired token, network error, 401 response) | Small | 1.1 |
| 1.5 | Write `login-commands.test.ts` (device code flow mock, API key login mock, logout, `isAuthenticated`) | Medium | 1.3, 1.4 |
| 1.6 | Write `config.test.ts` (`findConfigFile` discovery, `loadConfig` parse/reject, `readConfigFile` raw content) | Small | 1.1 |
| 1.7 | Write CLI argument parsing matrix tests (`test/cli-parsing.test.ts`) | Medium | — |

### Phase 2: Stub replacement (P0-P1 — weeks 2-4)

**Goal:** Replace all 8 stub test files with real behavioral tests.

| # | Task | Effort | Depends On |
|---|------|--------|------------|
| 2.1 | Rewrite `branch-commands.test.ts` (17 tests → real config load, CRUD lifecycle, sleep/wake, error paths) | Medium | 1.6 |
| 2.2 | Rewrite `webhook-commands.test.ts` (17 tests → create/list/test/dispatch/logs with SQLite) | Medium | 1.2, 1.6 |
| 2.3 | Rewrite `function-commands.test.ts` (10 tests → create/dev/build/list/deploy/logs) | Medium | 1.1 |
| 2.4 | Rewrite `storage-commands.test.ts` (11 tests → init prompt flow, config/env mutation, upload/list) | Medium | 1.1, 1.6 |
| 2.5 | Rewrite `rls-commands.test.ts` (13 tests → create/list/disable, duplicate warning, PostgreSQL test schema) | Medium | 1.1, 1.2 |
| 2.6 | Rewrite `rls-test-command.test.ts` (7 tests → RLS evaluation, test results JSON, schema cleanup) | Large | 1.2 |
| 2.7 | Delete `auth-commands.test.ts` (9 stubs, redundant with `auth-command.test.ts`) | Trivial | — |
| 2.8 | Rewrite `dev.test.ts` (3 skeleton tests → full dev server lifecycle) | Large | 1.1 |

### Phase 3: Coverage expansion (P1-P2 — weeks 4-6)

**Goal:** Deepen existing partial tests and add missing integration scenarios.

| # | Task | Effort | Depends On |
|---|------|--------|------------|
| 3.1 | Expand `scanner.test.ts` (1 scenario → 5+: empty tables, no relations, circular FK, array columns, enums, large schemas) | Small | — |
| 3.2 | Expand `route-scanner.test.ts` (1 scenario → 5+: PATCH/DELETE, no-auth routes, nested route groups, malformed decorators) | Small | — |
| 3.3 | Expand `logger.test.ts` (add stdout/stderr capture, format verification, color code output, unicode boundary) | Small | — |
| 3.4 | Fix `graphql-type-map.test.ts` (import from source instead of duplicating function) | Small | — |
| 3.5 | Expand `iac-commands.test.ts` (import and exercise runIacAnalyze, runIacExport, runIacImport from source) | Medium | 1.1 |
| 3.6 | Add output format snapshot tests for all list/render commands | Medium | 1.1 |
| 3.7 | Add `auth-providers.test.ts` (verify all 7 provider templates, env var generation, config code structure) | Small | — |

### Phase 4: Deep integration (P2-P3 — weeks 6-8)

**Goal:** End-to-end flows, spinners, build verification, and edge hardening.

| # | Task | Effort | Depends On |
|---|------|--------|------------|
| 4.1 | Dev server integration tests (start → health check → file change → restart → shutdown) | Large | 1.1, 2.8 |
| 4.2 | IAC workflow integration (sync → generate → analyze — full pipeline) | Medium | 1.1 |
| 4.3 | `spinner.test.ts` (createSpinner, withSpinner success/failure/timer) | Small | — |
| 4.4 | End-to-end binary smoke tests (spawn `bb`, verify exit codes and stdout) | Small | — |
| 4.5 | Migrate cross-product integration (migrate → graphql regenerate → context regenerate) | Medium | 1.2 |

---

## 7) Shared test infrastructure to build

### 7.1 Fixture module (`test/fixtures.ts`)

```typescript
// test/fixtures.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export interface TestProject {
  root: string;
  cleanup: () => void;
}

export function createTestProject(files?: Record<string, string>): TestProject {
  const root = join(tmpdir(), `bb-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(root, { recursive: true });

  if (files) {
    for (const [relPath, content] of Object.entries(files)) {
      const absPath = join(root, relPath);
      mkdirSync(join(absPath, ".."), { recursive: true });
      writeFileSync(absPath, content);
    }
  }

  return {
    root,
    cleanup: () => {
      // rmSync(root, { recursive: true, force: true });
    },
  };
}

export function createMinimalSchema(): string {
  return `
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  age: integer("age"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content"),
  userId: text("user_id").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
`;
}

export function createMinimalConfig(overrides?: Record<string, unknown>): string {
  return `
import { defineConfig } from "@betterbase/core";

export default defineConfig({
  project: { name: "test-project" },
  ${overrides ? JSON.stringify(overrides, null, 2).slice(1, -1) : ""}
});
`;
}
```

### 7.2 Database harness (`test/fixtures/database.ts`)

```typescript
// test/fixtures/database.ts
import { Database } from "bun:sqlite";

export interface TestDatabase {
  db: Database;
  cleanup: () => void;
}

export function createTestDatabase(): TestDatabase {
  const db = new Database(":memory:");

  // Create migrations tracking table
  db.run(`
    CREATE TABLE IF NOT EXISTS _betterbase_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum TEXT NOT NULL
    )
  `);

  // Create webhook deliveries table
  db.run(`
    CREATE TABLE IF NOT EXISTS _betterbase_webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      status TEXT NOT NULL,
      request_url TEXT,
      response_code INTEGER,
      response_body TEXT,
      error TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return {
    db,
    cleanup: () => db.close(),
  };
}

export function seedMigrationTracking(
  db: Database,
  migrations: { name: string; checksum: string }[],
): void {
  const stmt = db.prepare(
    "INSERT INTO _betterbase_migrations (name, checksum) VALUES (?, ?)",
  );
  for (const m of migrations) {
    stmt.run(m.name, m.checksum);
  }
}

export function seedWebhookDeliveries(
  db: Database,
  deliveries: {
    id: string;
    webhook_id: string;
    status: string;
    response_code?: number;
    error?: string;
  }[],
): void {
  const stmt = db.prepare(
    `INSERT INTO _betterbase_webhook_deliveries
     (id, webhook_id, status, response_code, error, attempt_count)
     VALUES (?, ?, ?, ?, ?, 1)`,
  );
  for (const d of deliveries) {
    stmt.run(d.id, d.webhook_id, d.status, d.response_code ?? null, d.error ?? null);
  }
}
```

### 7.3 Config fixture generator

```typescript
// test/fixtures/config.ts
import { createTestProject } from "./fixtures";

export const VALID_CONFIG_TS = `
import { defineConfig } from "@betterbase/core";

export default defineConfig({
  project: { name: "test-project" },
  provider: {
    type: "sqlite" as const,
    connectionString: "local.db",
  },
  storage: {
    provider: "s3" as const,
    bucket: "test-bucket",
    region: "us-east-1",
  },
  webhooks: [],
});
`;

export const CONFIG_WITH_WEBHOOKS = `
import { defineConfig } from "@betterbase/core";

export default defineConfig({
  project: { name: "test-project" },
  webhooks: [
    {
      id: "webhook-abc123",
      table: "users",
      events: ["INSERT", "UPDATE"],
      url: "process.env.WEBHOOK_USERS_URL",
      secret: "process.env.WEBHOOK_SECRET",
      enabled: true,
    },
  ],
});
`;

export const INVALID_CONFIG_TS = `
export default {
  project: { name: "test-project" },
  provider: {
    type: "invalid-provider",
  },
};
`;

export function createConfigProject(
  configContent: string = VALID_CONFIG_TS,
) {
  return createTestProject({
    "betterbase.config.ts": configContent,
    "package.json": JSON.stringify({ name: "test-project" }),
  });
}
```

### 7.4 Credential fixture generator

```typescript
// test/fixtures/credentials.ts
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

const BETTERBASE_DIR = join(homedir(), ".betterbase");
const CREDENTIALS_FILE = join(BETTERBASE_DIR, "credentials.json");

export interface CredentialFixture {
  token: string;
  admin_email: string;
  server_url: string;
  created_at: string;
}

export function setupCredentialsFile(
  credentials: CredentialFixture,
): () => void {
  mkdirSync(BETTERBASE_DIR, { recursive: true });
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials));

  return () => {
    if (existsSync(CREDENTIALS_FILE)) {
      rmSync(CREDENTIALS_FILE);
    }
  };
}

export function createValidCredentials(): CredentialFixture {
  return {
    token: `token_${randomUUID()}`,
    admin_email: "admin@test.com",
    server_url: "https://api.betterbase.io",
    created_at: new Date().toISOString(),
  };
}

export function createExpiredCredentials(): CredentialFixture {
  return {
    token: "expired_token",
    admin_email: "admin@test.com",
    server_url: "https://api.betterbase.io",
    created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
```

### 7.5 Fetch mock harness

```typescript
// test/fixtures/fetch-mock.ts

export interface MockFetchRoute {
  method?: string;
  url: string | RegExp;
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export function mockFetch(
  routes: MockFetchRoute[],
): typeof globalThis.fetch & { calls: Request[] } {
  const calls: Request[] = [];

  const mock = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const request = new Request(input instanceof Request ? input : url, init);
    calls.push(request);

    for (const route of routes) {
      const urlMatch =
        typeof route.url === "string"
          ? url.includes(route.url)
          : route.url.test(url);
      const methodMatch = !route.method || route.method === method;

      if (urlMatch && methodMatch) {
        return new Response(JSON.stringify(route.body), {
          status: route.status,
          headers: {
            "Content-Type": "application/json",
            ...route.headers,
          },
        });
      }
    }

    return new Response(JSON.stringify({ error: "unmocked" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  };

  (mock as unknown as { calls: Request[] }).calls = calls;
  return mock as typeof globalThis.fetch & { calls: Request[] };
}
```

---

## 8) Output format snapshot testing pattern

```typescript
// test/snapshots/migrate-preview.txt (golden file)
// Generated 2026-04-29 — bb migrate preview with 2 tables, 1 modified column

// test/output-snapshots.test.ts
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SNAPSHOTS_DIR = join(import.meta.dir, "snapshots");
const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === "true";

async function captureOutput(fn: () => Promise<void>): Promise<string> {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const lines: string[] = [];

  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  };

  try {
    await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }

  return lines.join("\n");
}

function assertSnapshot(name: string, actual: string): void {
  const snapshotPath = join(SNAPSHOTS_DIR, `${name}.txt`);

  if (UPDATE_SNAPSHOTS) {
    writeFileSync(snapshotPath, actual);
    return;
  }

  let expected: string;
  try {
    expected = readFileSync(snapshotPath, "utf-8");
  } catch {
    throw new Error(
      `Snapshot "${name}" not found. Run with UPDATE_SNAPSHOTS=true to generate.`,
    );
  }

  expect(actual.trim()).toBe(expected.trim());
}
```

Usage:

```typescript
describe("bb migrate preview output", () => {
  it("matches snapshot for 2-table schema", async () => {
    const output = await captureOutput(async () => {
      const changes: MigrationChange[] = [
        { type: "create_table", table: "users", isDestructive: false },
        { type: "create_table", table: "posts", isDestructive: false },
        { type: "modify_column", table: "posts", column: "title", isDestructive: false },
      ];
      displayDiff(changes);
    });
    assertSnapshot("migrate-preview-2-tables", output);
  });
});
```

---

## 9) Test file structure target (post-upgrade)

```
packages/cli/test/
├── fixtures/
│   ├── fixtures.ts              # TestProject, createMinimalSchema, createMinimalConfig
│   ├── database.ts              # createTestDatabase, seed helpers
│   ├── config.ts                # Config file generators (valid, with webhooks, invalid)
│   ├── credentials.ts           # credential file setup/teardown
│   └── fetch-mock.ts            # MockFetchRoute, mockFetch()
├── snapshots/
│   ├── migrate-preview-2-tables.txt
│   ├── webhook-list.txt
│   ├── webhook-logs.txt
│   ├── branch-list.txt
│   ├── function-list.txt
│   └── rls-list.txt
├── unit/
│   ├── migrate-utils.test.ts    # ✓ Keep (good)
│   ├── migrate.test.ts          # ✓ Keep (good)
│   ├── prompts.test.ts          # ✓ Keep (good)
│   ├── provider-prompts.test.ts # ✓ Keep (good)
│   ├── logger.test.ts           # ✏ Expand (capture stdout)
│   ├── spinner.test.ts          # ✚ New
│   ├── scanner.test.ts          # ✏ Expand (5+ scenarios)
│   ├── route-scanner.test.ts    # ✏ Expand (5+ scenarios)
│   ├── graphql-type-map.test.ts # ✏ Fix (import from source)
│   ├── credentials.test.ts      # ✚ New
│   ├── api-client.test.ts       # ✚ New
│   ├── config.test.ts           # ✚ New
│   └── auth-providers.test.ts   # ✚ New
├── integration/
│   ├── init.test.ts             # ✚ Rewrite (scaffold project)
│   ├── dev.test.ts              # ✚ Rewrite (server lifecycle)
│   ├── migrate-from-convex.test.ts # ✓ Keep (good)
│   ├── context-generator.test.ts   # ✓ Keep (good)
│   ├── generate-crud.test.ts       # ✓ Keep (good)
│   ├── edge-cases.test.ts          # ✓ Keep (good)
│   ├── auth-command.test.ts        # ✏ Expand (addProvider)
│   ├── login-commands.test.ts      # ✚ Rewrite (credential lifecycle)
│   ├── webhook-commands.test.ts    # ✚ Rewrite (full lifecycle)
│   ├── branch-commands.test.ts     # ✚ Rewrite (full lifecycle)
│   ├── function-commands.test.ts   # ✚ Rewrite (full lifecycle)
│   ├── storage-commands.test.ts    # ✚ Rewrite (full lifecycle)
│   ├── rls-commands.test.ts        # ✚ Rewrite (full lifecycle)
│   ├── rls-test-command.test.ts    # ✚ Rewrite (PG schema)
│   ├── iac-commands.test.ts        # ✏ Expand (import from source)
│   └── iac-workflow.test.ts        # ✚ New (sync → generate pipeline)
├── e2e/
│   └── binary-smoke.test.ts     # ✚ New
├── cli/
│   ├── smoke.test.ts            # ✏ Expand (full subcommand tree)
│   ├── cli-parsing.test.ts      # ✚ New (argv → parsed options)
│   └── output-snapshots.test.ts # ✚ New (format regression)
└── error-messages.test.ts       # ✏ Expand (real code paths)
```

Legend: ✓ Keep | ✏ Expand | ✚ New

---

## 10) Acceptance criteria

### Phase 1 (Foundation)
- [ ] `credentials.test.ts` passes: save, load, clear, corrupt file, expired, Zod validation
- [ ] `api-client.test.ts` passes: valid token, expired token, 401, network error
- [ ] `login-commands.test.ts` passes: device code mock, API key mock, logout, isAuthenticated
- [ ] `config.test.ts` passes: findConfigFile discovers .ts/.js/.mts, loadConfig parses/rejects
- [ ] `cli-parsing.test.ts` passes: 10+ subcommands with argv matrix
- [ ] Zero `expect(true).toBe(true)` assertions remain in the codebase

### Phase 2 (Stub replacement)
- [ ] All 8 stub files replaced with real behavioral tests
- [ ] `branch-commands.test.ts`: create → list → status → sleep → wake → delete lifecycle
- [ ] `webhook-commands.test.ts`: create → list → test dispatch → query logs
- [ ] `function-commands.test.ts`: create → dev → build → list → deploy → logs
- [ ] `storage-commands.test.ts`: init prompt flow → config mutation → upload → list
- [ ] `rls-commands.test.ts`: create → list → disable → duplicate warning
- [ ] `rls-test-command.test.ts`: PostgreSQL RLS evaluation → JSON results → cleanup
- [ ] `dev.test.ts`: start server → health check → file change → shutdown
- [ ] `auth-commands.test.ts` deleted (redundant)

### Phase 3 (Coverage expansion)
- [ ] `scanner.test.ts`: 5+ scenarios (empty, no relations, circular FK, enums, large schema)
- [ ] `route-scanner.test.ts`: 5+ scenarios (PATCH/DELETE, no-auth, nested groups, malformed)
- [ ] `graphql-type-map.test.ts`: imports from source, not duplicated
- [ ] `iac-commands.test.ts`: imports and exercises source functions
- [ ] Output snapshot tests: 5+ commands with golden file comparison
- [ ] `UPDATE_SNAPSHOTS=true` regenerates all golden files in one pass

### Phase 4 (Deep integration)
- [ ] Dev server integration: start → HTTP 200 → file change → restart → SIGTERM cleanup
- [ ] IAC workflow: sync detects changes → generate produces api.d.ts → analyze reports complexity
- [ ] `spinner.test.ts`: withSpinner success and failure paths
- [ ] Binary smoke: `bb --version`, `bb --help`, `bb init --help` exit codes
- [ ] Cross-product: migrate → graphql regenerate → context regenerate chain

### Non-acceptance criteria
- [ ] No `expect(true).toBe(true)` in any test file
- [ ] No locally duplicated logic (import from source, don't copy-paste)
- [ ] No test that depends on network access (all fetch calls mocked)
- [ ] No test that depends on a running server process outside the test's control
- [ ] Every test file cleans up temp directories and database connections in `afterAll`/`finally`

---

## 11) Dependencies between phases

```
Phase 1 (Foundation)
  ├─ fixtures.ts ──────────────► Everything
  ├─ database.ts ──────────────► Phase 2: webhook, rls-test
  │                            ► Phase 4: migrate integration
  ├─ credentials.test.ts ──────► Phase 2: login-commands
  ├─ api-client.test.ts ──────► Phase 2: login-commands, all authenticated tests
  ├─ config.test.ts ───────────► Phase 2: branch, webhook, storage
  └─ cli-parsing.test.ts ──────► Phase 2-4: all command tests

Phase 2 (Stub replacement)
  ├─ webhook-commands ─────────► Phase 3: output snapshots
  ├─ branch-commands ──────────► Phase 3: output snapshots
  ├─ dev.test.ts ──────────────► Phase 4: dev server integration
  └─ rls-test ─────────────────► Phase 3: PostgreSQL integration

Phase 3 (Coverage expansion)
  ├─ output snapshots ─────────► Phase 4: e2e visual regression
  └─ iac-commands ─────────────► Phase 4: IAC workflow

Phase 4 (Deep integration)
  └─ (leaf phase — final hardening)
```

---

## 12) Risk register

| Risk | Severity | Mitigation |
|------|----------|------------|
| PostgreSQL required for RLS test tests | Medium | Use `pg-mem` or Docker container; skip if PG unavailable |
| Dev server tests flaky (port binding, timing) | Medium | Use random ports, retry logic, generous timeouts |
| `execSync("bunx drizzle-kit push")` in auth tests blocks | Low | Catch failure gracefully (already done); mock if needed |
| Snapshot files drift from code changes | Low | `UPDATE_SNAPSHOTS=true` regenerates; CI asserts clean |
| Mocking `import()` for config loading is fragile | Medium | Use real temp files with `betterbase.config.ts`; avoid module mocking |
| Bun.spawn for e2e binary tests slow in CI | Low | Keep scope small (version, help, init --help only) |

---

## 13) Estimated effort summary

| Phase | New Files | Rewrites | Expansions | Est. Person-Weeks |
|-------|-----------|----------|------------|-------------------|
| Phase 1 (Foundation) | 7 | 1 | 0 | 2 |
| Phase 2 (Stub replacement) | 0 | 8 | 0 | 3 |
| Phase 3 (Coverage expansion) | 2 | 0 | 7 | 2 |
| Phase 4 (Deep integration) | 2 | 0 | 0 | 2 |
| **Total** | **11** | **9** | **7** | **9** |

---

## 14) Related documentation

- [CLI Overview](../cli/overview.md) — Full command reference
- [API Reference — CLI Commands](../api-reference/cli-commands.md) — API-level details
- [Core Hardening Review v3](../core/hardening-review-v3.md) — Security/reliability baseline
- [Configuration](../core/config.md) — Config schema and validation
- [Migration Guide](../core/migration.md) — Database migration patterns
