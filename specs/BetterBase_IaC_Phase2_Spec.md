# BetterBase IaC — Phase 2 Orchestrator Specification

> **For Kilo Code Orchestrator**
> Depends on: BetterBase_InfraAsCode_Spec.md (IAC-01 through IAC-25) fully complete and tests passing.
> Execute tasks in strict order within each phase. Do not skip phases.
> All paths relative to monorepo root unless noted.
> Task prefix: **P2-**

---

## Overview — What Phase 2 Builds

| Area | Tasks | Delivers |
|---|---|---|
| **Project structure** | P2-01 – P2-04 | `src/modules/` convention, clean templates, deprecated code removed |
| **`bb dev` full impl** | P2-05 – P2-08 | Unified watcher, process manager, dev overlay, error formatting |
| **Real-time system** | P2-09 – P2-13 | Full WS lifecycle, heartbeat, table-dependency inference, batched invalidation |
| **Storage ctx** | P2-14 – P2-17 | `ctx.storage` fully wired to S3/MinIO, browser upload endpoint, storage migration table |
| **Scheduler** | P2-18 – P2-21 | DB-backed job queue, `ctx.scheduler` fully wired, worker loop, cron rebuild on real parser |
| **Client hooks** | P2-22 – P2-27 | `useQuery`, `useMutation`, `useAction`, `usePaginatedQuery`, `ConvexProvider`, vanilla client |
| **Developer docs** | P2-28 – P2-30 | `docs/iac/` MDX files, generated API reference, updated README |

**Total: 30 tasks across 7 phases.**

---

## Architectural Contract (Phase 2 adds on top of Phase 1)

```
betterbase/                         ← IAC layer (Phase 1)
├── schema.ts
├── queries/
├── mutations/
├── actions/
├── cron.ts
└── _generated/

src/
├── modules/                 ← NEW (Phase 2): shared server-side logic
│   ├── email.ts             ← e.g. sendWelcomeEmail() used by mutations
│   ├── stripe.ts
│   └── utils.ts
├── index.ts                 ← app entry (minimal)
└── db/
    └── schema.generated.ts  ← owned by bb iac sync

packages/
├── core/src/iac/
│   ├── realtime/            ← Phase 1 stubs → Phase 2 full impl
│   │   ├── subscription-tracker.ts
│   │   ├── invalidation-manager.ts
│   │   ├── heartbeat.ts     ← NEW
│   │   └── table-dep-inferrer.ts ← NEW
│   ├── storage/             ← NEW
│   │   └── storage-ctx.ts
│   └── scheduler/           ← NEW
│       ├── scheduler-ctx.ts
│       └── job-worker.ts
└── client/src/iac/          ← Phase 1 stubs → Phase 2 full impl
    ├── provider.tsx          ← NEW: ConvexProvider equivalent
    ├── hooks.ts              ← full impl
    ├── paginated-query.ts    ← NEW
    └── vanilla.ts            ← NEW: non-React client
```

---

## Phase A — Project Structure Refactor

### Task P2-01 — Create `src/modules/` Convention

**Depends on:** IAC-25 (Phase 1 complete)

**What it is:** The `modules/` pattern is the IaC answer to "where does shared server-side code live?" Instead of scattering helpers across `src/routes/`, `src/lib/`, etc., everything reusable is a module. Functions in `betterbase/` import from `src/modules/`. Nothing in `src/modules/` depends on Hono or route concerns — it is pure business logic.

**Create file:** `templates/iac/src/modules/.gitkeep`

Empty file — establishes the directory.

**Create file:** `templates/iac/src/modules/README.md`

```markdown
# modules/

Shared server-side logic imported by your `betterbase/` functions.

**Rules:**
- No Hono imports. No HTTP concepts (no `Context`, no `c.req`, no `c.json`).
- No direct DB calls. Use `ctx.db` inside your `betterbase/` functions instead.
- Pure TypeScript — accepts plain arguments, returns plain values.
- Can import from `@betterbase/core/iac` for types only.

**Example:**

```typescript
// src/modules/email.ts
export async function sendWelcomeEmail(to: string, name: string) {
  // ...nodemailer or Resend SDK call
}
```

```typescript
// betterbase/mutations/users.ts
import { mutation } from "@betterbase/core/iac";
import { v } from "@betterbase/core/iac";
import { sendWelcomeEmail } from "../../src/modules/email";

export const createUser = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("users", args);
    await sendWelcomeEmail(args.email, args.name);
    return id;
  },
});
```
```

**Acceptance criteria:**
- `templates/iac/src/modules/` directory created with `.gitkeep` and README
- README clearly states the "no Hono, no direct DB" rule

---

### Task P2-02 — New IaC-First Project Template

**Depends on:** P2-01

**What it is:** The existing `templates/base/` and `templates/auth/` were built for the old hand-written route pattern. Add a new `templates/iac/` template that is IaC-first from day one. The `bb init` command gains an `--iac` flag that scaffolds this template.

**Create directory structure:**

```
templates/iac/
├── package.json
├── tsconfig.json
├── betterbase.config.ts
├── src/
│   ├── index.ts           ← minimal Hono server, mounts /betterbase router only
│   └── modules/
│       └── README.md      ← from P2-01
└── betterbase/
    ├── schema.ts          ← starter schema (todos example)
    ├── queries/
    │   └── todos.ts       ← listTodos, getTodo
    ├── mutations/
    │   └── todos.ts       ← createTodo, toggleTodo, deleteTodo
    ├── actions/
    │   └── .gitkeep
    └── cron.ts            ← empty cron file
```

**Create file:** `templates/iac/package.json`

```json
{
  "name": "my-betterbase-project",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev":   "bb dev",
    "sync":  "bb iac sync",
    "diff":  "bb iac diff",
    "gen":   "bb iac generate"
  },
  "dependencies": {
    "@betterbase/core":   "workspace:*",
    "@betterbase/client": "workspace:*",
    "@betterbase/server": "workspace:*",
    "hono": "^4.0.0"
  }
}
```

> Note: `@betterbase/server` must also expose the `@betterbase/server/routes/betterbase`
> subpath export (via its `package.json` `exports` map) so the generated
> `src/index.ts` above can import `betterbaseRouter`. Without that export,
> `bun install` resolves the generated import cleanly only if the subpath is
> declared.

**Create file:** `templates/iac/src/index.ts`

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { betterbaseRouter } from "@betterbase/server/routes/betterbase";
import { discoverFunctions, setFunctionRegistry } from "@betterbase/core/iac";
import { join } from "path";

const app = new Hono();
app.use("*", cors());

// Discover and register betterbase/ functions on startup
const fns = await discoverFunctions(join(process.cwd(), "betterbase"));
setFunctionRegistry(fns);

// Authentication: require a valid bearer token (admin API key or JWT) before
// any betterbase route or generated function runs. In local development you may
// instead configure a safe dev-auth mode that trusts a known dev token, but
// protected behavior must be preserved outside development.
app.use("/betterbase/*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  // verifyAdminToken / api-key lookup happens inside betterbaseRouter's middleware
  await next();
});

// Mount the betterbase router — this is your entire API surface
app.route("/betterbase", betterbaseRouter);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

export default { port: 3000, fetch: app.fetch };
```

**Create file:** `templates/iac/betterbase/schema.ts`

```typescript
import { defineSchema, defineTable, v } from "@betterbase/core/iac";

export default defineSchema({
  todos: defineTable({
    text:      v.string(),
    completed: v.boolean(),
    authorId:  v.optional(v.string()),
  })
  .index("by_author",    ["authorId"])
  .index("by_completed", ["completed", "_createdAt"]),
});
```

**Create file:** `templates/iac/betterbase/queries/todos.ts`

```typescript
import { query } from "@betterbase/core/iac";
import { v } from "@betterbase/core/iac";

export const listTodos = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("todos").order("desc").take(100).collect();
  },
});

export const getTodo = query({
  args: { id: v.id("todos") },
  handler: async (ctx, args) => {
    return ctx.db.get("todos", args.id);
  },
});
```

**Create file:** `templates/iac/betterbase/mutations/todos.ts`

```typescript
import { mutation } from "@betterbase/core/iac";
import { v } from "@betterbase/core/iac";

export const createTodo = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("todos", { text: args.text, completed: false });
  },
});

export const toggleTodo = mutation({
  args: { id: v.id("todos"), completed: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch("todos", args.id, { completed: args.completed });
  },
});

export const deleteTodo = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, args) => {
    await ctx.db.delete("todos", args.id);
  },
});
```

**Create file:** `templates/iac/betterbase/cron.ts`

```typescript
// import { cron } from "@betterbase/core/iac";
// import { api } from "./_generated/api";
//
// Example: run cleanup every day at midnight UTC
// cron("daily-cleanup", "0 0 * * *", api.mutations.todos.cleanup, {});
```

**Update file:** `packages/cli/src/commands/init.ts`

Add `--iac` flag to `bb init`:

```typescript
// In the options section of runInitCommand:
if (opts.iac) {
  // Copy templates/iac/ to target directory
  await copyTemplate("iac", targetDir);
  // Run bb iac sync immediately to generate schema + migrations
  await runIacSync(targetDir, { force: false });
  // Run bb iac generate to produce _generated/api.d.ts
  await runIacGenerate(targetDir);
  success(`IaC project created at ${targetDir}`);
  info("Next steps:");
  info("  cd " + name);
  info("  bun install");
  info("  bb dev");
  return;
}
```

**Acceptance criteria:**
- `bb init my-app --iac` scaffolds the IaC template
- `betterbase/schema.ts`, `betterbase/queries/todos.ts`, `betterbase/mutations/todos.ts` created
- `bb iac sync` runs automatically after scaffolding
- `curl -fsS http://localhost:3000/health` returns `{"status":"ok"}`
- `curl -fsS http://localhost:3000/betterbase/...` mounts the betterbase router (no 404)
- the scaffolded `src/index.ts`, `betterbase/schema.ts`, and `betterbase/queries/`, `betterbase/mutations/` directories exist on disk (verifiable via `test -f` / `test -d`)
- `src/modules/` exists with README

---

### Task P2-03 — Deprecate Old Route/Schema Boilerplate from Init

**Depends on:** P2-02

**What it is:** The existing `bb init` (without `--iac`) still works, but should no longer generate hand-written route files. Instead it scaffolds a minimal server and suggests running `bb init --iac` for the full experience. The old `templates/base/src/routes/` patterns stay on disk (users may rely on them) but the CLI no longer actively produces them.

**Modify file:** `packages/cli/src/commands/init.ts`

At the top of `runInitCommand()`, when `--iac` is not passed, print a notice:

```typescript
if (!opts.iac) {
  warn("Tip: run `bb init --iac` for the recommended IaC project structure.");
  warn("     The IaC template uses betterbase/ functions + auto-migration instead of hand-written routes.");
}
```

No other change — old templates remain. This task is purely additive communication.

**Create file:** `templates/base/MIGRATION_GUIDE.md`

```markdown
# Migrating to BetterBase IaC

The `templates/base/` pattern (hand-written Hono routes + Drizzle schema) is
fully supported but is no longer the recommended starting point.

## Recommended: IaC pattern

```bash
# New project
bb init my-app --iac

# Existing project — add IaC alongside your routes
mkdir betterbase
bb iac generate
```

## How to move existing tables to IaC

1. Copy your Drizzle column definitions to `betterbase/schema.ts` using `v.*` validators.
2. Run `bb iac diff` to see what would change.
3. If the diff looks correct, run `bb iac sync` — it generates the migration.
4. Replace route handlers with `betterbase/mutations/` and `betterbase/queries/` files.
5. Remove the old route files incrementally.

The betterbase/ layer is additive — your existing Hono routes continue to work
while you migrate function-by-function.
```

**Acceptance criteria:**
- `bb init` (without `--iac`) prints a deprecation notice pointing to `--iac`
- `templates/base/MIGRATION_GUIDE.md` exists
- No existing template files deleted

---

### Task P2-04 — Remove Deprecated Internal Patterns

**Depends on:** P2-03

**What it is:** Several internal CLI utilities reference the old "scan schema files + scan route files" approach (the `SchemaScanner` and `RouteScanner` used by the context generator). These still work, but the context generator should also pick up `betterbase/` when it exists and include IaC functions in the generated `.betterbase-context.json`.

**Modify file:** `packages/cli/src/utils/context-generator.ts`

After the existing schema and route scanning, add:

```typescript
// Check for betterbase/ directory — if present, add IaC function metadata
const betterbaseDir = join(projectRoot, "betterbase");
if (existsSync(betterbaseDir)) {
  const { discoverFunctions } = await import("@betterbase/core/iac");
  const fns = await discoverFunctions(betterbaseDir);

  context.iacFunctions = fns.map((f) => ({
    kind: f.kind,
    path: f.path,
    name: f.name,
  }));

  context.hasIaCLayer = true;
}
```

**Add to the AI prompt generated by the context generator:**

```typescript
// In generateAIPrompt():
if (context.hasIaCLayer) {
  prompt += `\n\nThis project uses BetterBase IaC. Server functions are in betterbase/:`;
  prompt += `\n- Queries (read-only): ${context.iacFunctions.filter(f => f.kind === "query").map(f => f.path).join(", ")}`;
  prompt += `\n- Mutations (writes): ${context.iacFunctions.filter(f => f.kind === "mutation").map(f => f.path).join(", ")}`;
  prompt += `\n- Actions (side-effects): ${context.iacFunctions.filter(f => f.kind === "action").map(f => f.path).join(", ")}`;
  prompt += `\nData model defined in betterbase/schema.ts. Use ctx.db inside function handlers.`;
}
```

**Acceptance criteria:**
- `bb dev` in an IaC project includes IaC function metadata in `.betterbase-context.json`
- AI context shows all betterbase/ functions, their kind, and paths
- Old SchemaScanner/RouteScanner still runs and is included (additive, not replacement)

---

## Phase B — `bb dev` Full Implementation

### Task P2-05 — Process Manager Core

**Depends on:** P2-04

**What it is:** `bb dev` currently delegates to `bun --watch`. The full implementation is a proper process manager: spawns the Bun server as a child process, handles restarts, pipes stdout/stderr with labelled prefixes, and exposes a restart API for watchers.

**Create file:** `packages/cli/src/commands/dev/process-manager.ts`

```typescript
import { spawn, type Subprocess } from "bun";
import { info, success, error, warn } from "../../utils/logger";
import chalk from "chalk";
import { join } from "path";

export class ProcessManager {
  private _proc:       Subprocess | null = null;
  private _projectRoot: string;
  private _restartCount = 0;
  private _restartCooldown = false;

  constructor(projectRoot: string) {
    this._projectRoot = projectRoot;
  }

  async start(): Promise<void> {
    if (this._proc) await this.stop();

    const entryPoint = join(this._projectRoot, "src", "index.ts");

    this._proc = spawn({
      cmd:    ["bun", "run", entryPoint],
      cwd:    this._projectRoot,
      env:    { ...process.env, NODE_ENV: "development" },
      stdout: "pipe",
      stderr: "pipe",
      onExit: (proc, code, signal) => {
        if (code !== 0 && code !== null && !this._restartCooldown) {
          error(`[server] Process exited with code ${code}. Restarting...`);
          this._scheduleRestart(500);
        }
      },
    });

    // Pipe stdout with [server] prefix
    this._pipeStream(this._proc.stdout, chalk.cyan("[server]"));
    this._pipeStream(this._proc.stderr, chalk.red("[server:err]"));

    success(`[dev] Server started (restart #${this._restartCount})`);
  }

  async stop(): Promise<void> {
    if (!this._proc) return;
    this._proc.kill("SIGTERM");
    await this._proc.exited.catch(() => {});
    this._proc = null;
  }

  async restart(reason?: string): Promise<void> {
    if (this._restartCooldown) return;
    this._restartCooldown = true;
    setTimeout(() => { this._restartCooldown = false; }, 300);

    if (reason) info(`[dev] Restarting — ${reason}`);
    this._restartCount++;
    await this.start();
  }

  private _scheduleRestart(delayMs: number) {
    setTimeout(() => this.restart("process exited"), delayMs);
  }

  private _pipeStream(stream: ReadableStream<Uint8Array> | null, prefix: string) {
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const pump = () => {
      reader.read().then(({ done, value }) => {
        if (done) return;
        const lines = decoder.decode(value).split("\n").filter(Boolean);
        lines.forEach(line => console.log(`${prefix} ${line}`));
        pump();
      }).catch(() => {});
    };
    pump();
  }
}
```

**Acceptance criteria:**
- Server process launched as a child — `bb dev` itself stays alive as the supervisor
- stdout/stderr piped with `[server]` prefix in cyan/red
- Process crash triggers automatic restart after 500ms
- Rapid restarts debounced (300ms cooldown)

---

### Task P2-06 — File Watcher with Debouncing

**Depends on:** P2-05

**Create file:** `packages/cli/src/commands/dev/watcher.ts`

```typescript
import { watch } from "fs";
import { join, extname, relative } from "path";
import { existsSync } from "fs";
import { info } from "../../utils/logger";

type WatchEvent = {
  path:     string;
  relative: string;
  kind:     "schema" | "function" | "module" | "server" | "config";
};

type Handler = (event: WatchEvent) => void | Promise<void>;

export class DevWatcher {
  private _handlers:  Handler[] = [];
  private _debounce:  Map<string, ReturnType<typeof setTimeout>> = new Map();
  private _debounceMs: number;
  private _watchers:  ReturnType<typeof watch>[] = [];

  constructor(opts: { debounceMs?: number } = {}) {
    this._debounceMs = opts.debounceMs ?? 150;
  }

  /** Register a handler called on every debounced event */
  on(handler: Handler): this {
    this._handlers.push(handler);
    return this;
  }

  /** Start watching the given project root */
  start(projectRoot: string) {
    const dirs: { path: string; recursive: boolean }[] = [
      { path: join(projectRoot, "betterbase"),     recursive: true  },
      { path: join(projectRoot, "src"),     recursive: true  },
    ];

    for (const { path, recursive } of dirs) {
      if (!existsSync(path)) continue;

      const w = watch(path, { recursive }, (event, filename) => {
        if (!filename) return;
        const fullPath = join(path, String(filename));
        const rel      = relative(projectRoot, fullPath);

        if (rel.includes("_generated")) return;   // never watch generated files
        if (rel.includes("node_modules")) return;
        if (![".ts", ".tsx", ".js", ".json"].includes(extname(fullPath))) return;

        const kind = this._classifyPath(rel);
        this._debounced(fullPath, () => {
          for (const h of this._handlers) h({ path: fullPath, relative: rel, kind });
        });
      });

      this._watchers.push(w);
    }

    info(`[dev] Watching ${dirs.filter(d => existsSync(d.path)).map(d => relative(projectRoot, d.path)).join(", ")}`);
  }

  stop() {
    this._watchers.forEach(w => w.close());
    this._watchers = [];
  }

  private _classifyPath(rel: string): WatchEvent["kind"] {
    if (rel.startsWith("betterbase/schema"))                  return "schema";
    if (rel.startsWith("betterbase/queries") ||
        rel.startsWith("betterbase/mutations") ||
        rel.startsWith("betterbase/actions") ||
        rel === "betterbase/cron.ts")                         return "function";
    if (rel.startsWith("src/modules"))                 return "module";
    if (rel === "betterbase.config.ts")                return "config";
    return "server";
  }

  private _debounced(key: string, fn: () => void) {
    clearTimeout(this._debounce.get(key));
    this._debounce.set(key, setTimeout(fn, this._debounceMs));
  }
}
```

**Acceptance criteria:**
- Events classified into `schema | function | module | server | config` kinds
- `_generated/` directory excluded from watch events (prevents watch loops)
- `node_modules` excluded
- 150ms debounce prevents rapid-fire triggers on save

---

### Task P2-07 — `bb dev` Command Full Rewrite

**Depends on:** P2-06

**Replace file:** `packages/cli/src/commands/dev.ts`

```typescript
import { join, relative } from "path";
import { existsSync } from "fs";
import chalk from "chalk";
import { info, success, warn, error } from "../utils/logger";
import { ProcessManager } from "./dev/process-manager";
import { DevWatcher }     from "./dev/watcher";
import { runIacSync }     from "./iac/sync";
import { runIacGenerate } from "./iac/generate";
import { ContextGenerator } from "../utils/context-generator";

export async function runDevCommand(projectRoot: string) {
  const hasBetterbase  = existsSync(join(projectRoot, "betterbase"));
  const hasIaC  = hasBetterbase;

  // Print banner
  console.log(chalk.bold.cyan("\n  BetterBase Dev\n"));
  if (hasIaC) {
    info("IaC layer detected — betterbase/ will be watched for schema and function changes.");
  }

  // --- Initial generation pass ---
  if (hasIaC) {
    info("[iac] Running initial sync...");
    await runIacSync(projectRoot, { force: false, silent: true }).catch((e: Error) =>
      warn(`[iac] Initial sync skipped: ${e.message}`)
    );
    await runIacGenerate(projectRoot).catch((e: Error) =>
      warn(`[iac] Initial generate skipped: ${e.message}`)
    );
  }

  // --- Start server process ---
  const pm = new ProcessManager(projectRoot);
  await pm.start();

  // --- Start context generator watcher (existing behavior) ---
  const ctxGen = new ContextGenerator();
  await ctxGen.generate(projectRoot).catch(() => {});

  // --- Start file watcher ---
  const watcher = new DevWatcher({ debounceMs: 150 });

  watcher.on(async (event) => {
    const label = chalk.dim(relative(projectRoot, event.path));

    switch (event.kind) {
      case "schema": {
        info(`[iac] Schema changed: ${label}`);
        const result = await runIacSync(projectRoot, { force: false, silent: false }).catch((e: Error) => {
          warn(`[iac] ${e.message}`);
          return null;
        });
        if (result !== null) {
          await pm.restart("schema synced");
        }
        break;
      }

      case "function": {
        info(`[iac] Function changed: ${label}`);
        await runIacGenerate(projectRoot).catch((e: Error) => warn(`[iac] ${e.message}`));
        await pm.restart("function file changed");
        break;
      }

      case "module": {
        info(`[server] Module changed: ${label}`);
        await pm.restart("module changed");
        break;
      }

      case "config": {
        info(`[config] betterbase.config.ts changed`);
        await pm.restart("config changed");
        break;
      }

      case "server": {
        // Standard server file change — restart without IaC steps
        await pm.restart(`${label} changed`);
        break;
      }
    }

    // Regenerate context on every change
    ctxGen.generate(projectRoot).catch(() => {});
  });

  watcher.start(projectRoot);

  // --- Graceful shutdown ---
  process.on("SIGINT",  async () => { await shutdown(); process.exit(0); });
  process.on("SIGTERM", async () => { await shutdown(); process.exit(0); });

  async function shutdown() {
    info("[dev] Shutting down...");
    watcher.stop();
    await pm.stop();
  }

  // Keep alive
  await new Promise(() => {});
}
```

**Update `packages/cli/src/index.ts`** to call the new `runDevCommand`:

```typescript
program
  .command("dev")
  .description("Start development server with IaC watch mode")
  .action(() => runDevCommand(process.cwd()));
```

**Acceptance criteria:**
- `bb dev` starts server, then enters watch mode — never exits
- Schema changes: `iac sync` → server restart
- Function file changes: `iac generate` → server restart
- Module/server file changes: server restart only (no IaC steps)
- `Ctrl+C` cleanly kills child process before exiting
- First run does an initial sync + generate before server starts

---

### Task P2-08 — Dev Error Formatter

**Depends on:** P2-07

**What it is:** Zod validation errors and IaC sync errors should be presented beautifully in the terminal, not as raw stack traces.

**Create file:** `packages/cli/src/commands/dev/error-formatter.ts`

```typescript
import { ZodError } from "zod";
import chalk from "chalk";

export function formatDevError(err: unknown, context: string): string {
  if (err instanceof ZodError) {
    const lines = [chalk.red(`  ✗ Validation error in ${context}`)];
    for (const issue of err.issues) {
      const path = issue.path.length ? issue.path.join(".") : "root";
      lines.push(`    ${chalk.dim(path)}: ${chalk.yellow(issue.message)}`);
    }
    return lines.join("\n");
  }

  if (err instanceof Error) {
    // Highlight the first relevant stack frame
    const relevant = err.stack
      ?.split("\n")
      .find(l => l.includes("betterbase/") || l.includes("src/modules"));
    return [
      chalk.red(`  ✗ ${context}: ${err.message}`),
      relevant ? chalk.dim(`    ${relevant.trim()}`) : "",
    ].filter(Boolean).join("\n");
  }

  return chalk.red(`  ✗ ${context}: ${String(err)}`);
}

/** Pretty-print a schema diff for the dev console */
export function formatDiffForDev(changes: { type: string; table: string; column?: string; destructive: boolean }[]): string {
  return changes.map(c => {
    const icon   = c.destructive ? chalk.red("⚠") : chalk.green("+");
    const detail = c.column ? `${c.table}.${c.column}` : c.table;
    return `  ${icon} ${chalk.dim(c.type.replace("_", " ").toLowerCase())} ${chalk.white(detail)}`;
  }).join("\n");
}
```

**Use in `runIacSync()` and `ProcessManager`** — replace raw `console.error` calls with `formatDevError()`.

**Acceptance criteria:**
- ZodError from bad function args shows field paths, not a raw dump
- Stack traces filtered to show only `betterbase/` or `src/modules/` frames
- Schema diff formatted with + / ⚠ icons and colors

---

## Phase C — Real-Time System (Full Implementation)

### Task P2-09 — WebSocket Server with Heartbeat

**Depends on:** P2-08

**What it is:** Replaces the stub WS handler (IAC-17) with a production-ready implementation. Adds ping/pong heartbeat, client tracking with metadata, and graceful disconnect detection.

**Replace file:** `packages/server/src/routes/betterbase/ws.ts`

```typescript
import { nanoid } from "nanoid";
import { subscriptionTracker } from "@betterbase/core/iac/realtime/subscription-tracker";
import { invalidationManager } from "@betterbase/core/iac/realtime/invalidation-manager";

const HEARTBEAT_INTERVAL_MS = 15_000;   // ping every 15s
const HEARTBEAT_TIMEOUT_MS  = 30_000;   // disconnect after 30s without pong

interface ConnectedClient {
  id:            string;
  ws:            WebSocket;   // Bun's native WebSocket
  projectSlug:   string;
  lastPong:      number;
  heartbeatTimer?: ReturnType<typeof setInterval>;
}

const clients = new Map<string, ConnectedClient>();

/** Bun WebSocket handler object — passed to Bun.serve() */
export const betterbaseWSHandler = {
  open(ws: any) {
    const clientId    = nanoid();
    const projectSlug = ws.data?.projectSlug ?? "default";

    ws.__clientId = clientId;

    const client: ConnectedClient = {
      id:          clientId,
      ws,
      projectSlug,
      lastPong:    Date.now(),
    };

    // Heartbeat — ping every 15s, disconnect if no pong in 30s
    client.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - client.lastPong;
      if (elapsed > HEARTBEAT_TIMEOUT_MS) {
        console.warn(`[ws] Client ${clientId} timed out — disconnecting`);
        ws.close(1001, "heartbeat timeout");
        return;
      }
      try { ws.send(JSON.stringify({ type: "ping" })); } catch {}
    }, HEARTBEAT_INTERVAL_MS);

    clients.set(clientId, client);

    // Wire invalidation push for this process
    invalidationManager.setPushFn((targetClientId, message) => {
      const c = clients.get(targetClientId);
      if (c) {
        try { c.ws.send(JSON.stringify(message)); } catch {}
      }
    });

    ws.send(JSON.stringify({ type: "connected", clientId }));
  },

  message(ws: any, data: string | Buffer) {
    const clientId: string = ws.__clientId;
    const client = clients.get(clientId);
    if (!client) return;

    let msg: Record<string, unknown>;
    try { msg = JSON.parse(String(data)); } catch { return; }

    switch (msg.type) {
      case "pong":
        client.lastPong = Date.now();
        break;

      case "subscribe":
        if (typeof msg.path === "string") {
          const tables = Array.isArray(msg.tables) ? msg.tables as string[] : ["*"];
          subscriptionTracker.subscribe(
            clientId,
            msg.path,
            (msg.args as Record<string, unknown>) ?? {},
            tables
          );
        }
        break;

      case "unsubscribe":
        if (typeof msg.path === "string") {
          subscriptionTracker.unsubscribe(clientId, msg.path, (msg.args as Record<string, unknown>) ?? {});
        }
        break;
    }
  },

  close(ws: any, code: number, reason: string) {
    const clientId: string = ws.__clientId;
    const client = clients.get(clientId);
    if (client?.heartbeatTimer) clearInterval(client.heartbeatTimer);
    clients.delete(clientId);
    subscriptionTracker.unsubscribeClient(clientId);
  },
};

/** For the admin dashboard stats endpoint */
export function getWSStats() {
  return {
    clients:  clients.size,
    channels: [...new Set(
      [...subscriptionTracker["_subs"].values()].map(s => s.functionPath)
    )],
  };
}

/** Mount in Bun.serve() options */
export function getBunServeConfig() {
  return {
    fetch(req: Request, server: any) {
      const url = new URL(req.url);
      if (url.pathname === "/betterbase/ws") {
        const projectSlug = url.searchParams.get("project") ?? "default";
        const ticket = url.searchParams.get("ticket");

        // Validate the WebSocket ticket and its project binding before
        // upgrading. Tickets are issued by a REST endpoint after auth and are
        // scoped to a single project; an invalid/mismatched ticket must be
        // rejected so connections cannot cross project boundaries.
        if (!ticket || !verifyWSTicket(ticket, projectSlug)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const upgraded = server.upgrade(req, { data: { projectSlug } });
        if (upgraded) return undefined;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    },
    websocket: betterbaseWSHandler,
  };
}
```

**Modify `packages/server/src/index.ts`** — replace Hono's ws adapter with Bun native:

```typescript
// Replace the Hono ws route with Bun native upgrade in the serve config
import { getBunServeConfig } from "./routes/betterbase/ws";

const bunWS = getBunServeConfig();

export default {
  port,
  fetch: async (req: Request, server: any) => {
    // Let Bun handle WS upgrade first
    const wsResponse = bunWS.fetch(req, server);
    if (wsResponse !== undefined) return wsResponse;
    // Fall through to Hono
    return app.fetch(req);
  },
  websocket: bunWS.websocket,
};
```

**Acceptance criteria:**
- Heartbeat pings every 15s; clients that don't respond within 30s are disconnected
- `subscribe` / `unsubscribe` messages handled correctly
- `pong` resets the heartbeat timer
- Client metadata (`projectSlug`) available from upgrade params
- `getWSStats()` returns live client count and channel list for the admin dashboard

---

### Task P2-10 — Table Dependency Inferrer

**Depends on:** P2-09

**What it is:** When a client subscribes with `tables: ["*"]` (wildcard — the default), every mutation invalidates them. That's fine for small apps but wasteful at scale. The table inferrer statically analyses a query handler's source to extract which tables it reads from, so subscriptions can be narrowed automatically.

**Create file:** `packages/core/src/iac/realtime/table-dep-inferrer.ts`

```typescript
/**
 * Statically infer which tables a query handler reads from.
 *
 * Strategy: regex-scan the handler's `.toString()` source for patterns like:
 *   ctx.db.get("users", ...)
 *   ctx.db.query("posts")
 *
 * This is best-effort — complex dynamic access falls back to ["*"] (wildcard).
 */
export function inferTableDependencies(handler: Function): string[] {
  const src    = handler.toString();
  const tables: Set<string> = new Set();

  // Match ctx.db.get("tableName", ...) or ctx.db.query("tableName")
  const GET_PATTERN   = /ctx\.db\.(?:get|query)\(\s*["'`]([a-zA-Z_][a-zA-Z0-9_]*)["'`]/g;
  const QUERY_PATTERN = /\.query\(\s*["'`]([a-zA-Z_][a-zA-Z0-9_]*)["'`]/g;

  let match: RegExpExecArray | null;
  while ((match = GET_PATTERN.exec(src))   !== null) tables.add(match[1]);
  while ((match = QUERY_PATTERN.exec(src)) !== null) tables.add(match[1]);

  // If nothing found or handler uses dynamic keys, fall back to wildcard
  return tables.size > 0 ? [...tables] : ["*"];
}

/**
 * Build a table → [functionPaths] map from the function registry.
 * Used to efficiently route invalidations server-side without scanning all subs.
 */
export function buildTableFunctionIndex(
  fns: { path: string; kind: string; handler: any }[]
): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const fn of fns) {
    if (fn.kind !== "query") continue;
    const tables = inferTableDependencies(fn.handler._handler);
    for (const table of tables) {
      if (!index.has(table)) index.set(table, []);
      index.get(table)!.push(fn.path);
    }
  }

  return index;
}
```

**Modify `packages/server/src/routes/betterbase/ws.ts`** — when a client subscribes without specifying tables:

```typescript
// In the "subscribe" case handler:
case "subscribe": {
  if (typeof msg.path === "string") {
    let tables = Array.isArray(msg.tables) ? msg.tables as string[] : null;

    if (!tables) {
      // Infer tables from the registered function's handler
      const fn = lookupFunction(msg.path);
      if (fn) {
        const { inferTableDependencies } = await import("@betterbase/core/iac/realtime/table-dep-inferrer");
        tables = inferTableDependencies((fn.handler as any)._handler);
      } else {
        tables = ["*"];
      }
    }

    subscriptionTracker.subscribe(clientId, msg.path, (msg.args as Record<string, unknown>) ?? {}, tables);
    // Confirm subscription with resolved tables
    ws.send(JSON.stringify({ type: "subscribed", path: msg.path, tables }));
  }
  break;
}
```

**Acceptance criteria:**
- `ctx.db.get("users", id)` in a handler → tables inferred as `["users"]`
- `ctx.db.query("posts")` → `["posts"]`
- Dynamic access (variable table name) → `["*"]`
- Server confirms subscription with the resolved table list
- Table index built from function registry for fast server-side invalidation routing

---

### Task P2-11 — Batched Invalidation

**Depends on:** P2-10

**What it is:** A mutation that does `insert + patch + delete` in sequence emits three change events. The invalidation manager should batch these within a single tick and send one invalidation message per affected subscription, not three.

**Replace file:** `packages/core/src/iac/realtime/invalidation-manager.ts`

```typescript
import { subscriptionTracker } from "./subscription-tracker";

export interface TableChangeEvent {
  table:  string;
  type:   "INSERT" | "UPDATE" | "DELETE";
  id:     string;
}

export interface InvalidationMessage {
  type:          "invalidate";
  functionPath:  string;
  args:          Record<string, unknown>;
  tables:        string[];   // which tables changed (for client-side filtering)
}

type PushFn = (clientId: string, message: InvalidationMessage) => void;

class InvalidationManager {
  private _push:    PushFn | null = null;
  private _pending: Map<string, Set<string>> = new Map();
  // key: `${clientId}:${functionPath}:${argsHash}` → Set<table>
  private _flushTimer: ReturnType<typeof setImmediate> | null = null;

  setPushFn(fn: PushFn) { this._push = fn; }

  emitTableChange(event: TableChangeEvent) {
    if (!this._push) return;

    const affected = subscriptionTracker.getAffectedSubscriptions(event.table);
    for (const sub of affected) {
      const key = `${sub.clientId}:${sub.functionPath}:${JSON.stringify(sub.args)}`;
      if (!this._pending.has(key)) {
        this._pending.set(key, new Set());
      }
      this._pending.get(key)!.add(event.table);
    }

    // Flush on next tick — batches all changes from the same mutation
    if (!this._flushTimer) {
      this._flushTimer = setImmediate(() => this._flush());
    }
  }

  private _flush() {
    this._flushTimer = null;
    if (!this._push) return;

    for (const [key, tables] of this._pending) {
      const [clientId, functionPath, argsJson] = key.split(":");
      // argsJson may contain colons — re-join
      const realArgsJson = key.slice(clientId.length + 1 + functionPath.length + 1);
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(realArgsJson); } catch {}

      this._push(clientId, {
        type:         "invalidate",
        functionPath,
        args,
        tables:       [...tables],
      });
    }

    this._pending.clear();
  }

  getStats() {
    // Stats now provided by ws.ts via getWSStats()
    return { clients: 0, channels: [] };
  }
}

export const invalidationManager = new InvalidationManager();
(globalThis as any).__betterbaseRealtimeManager = invalidationManager;
```

**Acceptance criteria:**
- Multiple `_emitChange()` calls within the same synchronous execution batch into a single push per subscription
- Uses `setImmediate` — flush happens after mutation handler resolves, before next event loop tick
- `tables` array in the message lets the client decide if it cares (future optimization)

---

### Task P2-12 — Update `subscriptionTracker` with Metrics

**Depends on:** P2-11

**Modify file:** `packages/core/src/iac/realtime/subscription-tracker.ts`

Add metric methods used by the admin dashboard and `getWSStats()`:

```typescript
// Add to the SubscriptionTracker class:

/** Count active subscriptions */
get size(): number { return this._subs.size; }

/** List unique function paths being subscribed to */
getActivePaths(): string[] {
  return [...new Set([...this._subs.values()].map(s => s.functionPath))];
}

/** All subscriptions for a given client */
getClientSubscriptions(clientId: string): QuerySubscription[] {
  return [...this._subs.values()].filter(s => s.clientId === clientId);
}

/** Debug dump — returns full subscription map */
dump(): QuerySubscription[] {
  return [...this._subs.values()];
}
```

**Acceptance criteria:**
- `subscriptionTracker.size` returns count of active subscriptions
- `subscriptionTracker.getActivePaths()` returns unique function paths
- Admin dashboard `GET /admin/projects/:id/realtime/stats` can call these

---

### Task P2-13 — Wire Real-Time Stats to Admin Dashboard

**Depends on:** P2-12

**Modify file:** `packages/server/src/routes/admin/project-scoped/realtime.ts`

Replace the stub with real stats:

```typescript
import { Hono } from "hono";
import { subscriptionTracker } from "@betterbase/core/iac/realtime/subscription-tracker";
import { getWSStats } from "../../../routes/betterbase/ws";

export const projectRealtimeRoutes = new Hono();

projectRealtimeRoutes.get("/stats", async (c) => {
  const wsStats = getWSStats();

  return c.json({
    connected_clients:     wsStats.clients,
    active_subscriptions:  subscriptionTracker.size,
    active_channels:       wsStats.channels.length,
    channels:              wsStats.channels,
    subscription_paths:    subscriptionTracker.getActivePaths(),
  });
});
```

**Acceptance criteria:**
- Returns real live stats (not hardcoded zeros)
- No crash when no clients are connected

---

## Phase D — Storage Context (Full Implementation)

### Task P2-14 — Storage Metadata Table

**Depends on:** P2-13

**What it is:** `ctx.storage.store(blob)` returns a `storageId` — an opaque identifier. The actual S3 key and metadata live in a per-project table so BetterBase can manage URLs, content-types, and ACLs.

**Create file:** `packages/server/migrations/011_iac_storage.sql`

```sql
-- Per-project storage metadata
-- One row per stored object. Lives in the project schema.
-- Called from provision_project_schema() in DB-01.

CREATE OR REPLACE FUNCTION betterbase_meta.provision_iac_storage(p_slug TEXT)
RETURNS VOID AS $$
DECLARE
  s TEXT := 'project_' || p_slug;
BEGIN
  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS %I._iac_storage (
      storage_id   TEXT PRIMARY KEY,
      s3_key       TEXT NOT NULL UNIQUE,
      bucket       TEXT NOT NULL,
      content_type TEXT,
      size_bytes   BIGINT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  $f$, s);
END;
$$ LANGUAGE plpgsql;
```

**Update `packages/server/src/routes/admin/projects.ts`** — call `provision_iac_storage` after `provision_project_schema`:

```typescript
// After provisioning the project schema:
await pool.query(
  "SELECT betterbase_meta.provision_iac_storage($1)",
  [slug]
);
```

**Acceptance criteria:**
- `_iac_storage` table created for every new project
- `storage_id` is the opaque ID returned to function handlers
- `s3_key` is the actual object key in S3/MinIO

---

### Task P2-15 — `StorageCtx` Full Implementation

**Depends on:** P2-14

**Create file:** `packages/core/src/iac/storage/storage-ctx.ts`

```typescript
import { nanoid } from "nanoid";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Pool } from "pg";

export interface StorageCtxConfig {
  pool:         Pool;
  projectSlug:  string;
  endpoint:     string;
  accessKey:    string;
  secretKey:    string;
  bucket:       string;
  publicBase?:  string;   // if set, getUrl() returns a public URL instead of presigned
}

export class StorageCtx {
  private _pool:   Pool;
  private _schema: string;
  private _s3:     S3Client;
  private _bucket: string;
  private _publicBase?: string;

  constructor(config: StorageCtxConfig) {
    this._pool   = config.pool;
    this._schema = `project_${config.projectSlug}`;
    this._bucket = config.bucket;
    this._publicBase = config.publicBase;

    this._s3 = new S3Client({
      endpoint:    config.endpoint,
      region:      "us-east-1",
      credentials: {
        accessKeyId:     config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
    });
  }

  /**
   * Store a Blob. Returns an opaque storageId.
   * The actual S3 key is internal — callers use getUrl() to retrieve it.
   */
  async store(blob: Blob, opts?: { contentType?: string }): Promise<string> {
    const storageId  = `st_${nanoid(20)}`;
    const ext        = this._extFromType(opts?.contentType ?? blob.type);
    const s3Key      = `${this._schema}/${storageId}${ext}`;
    const contentType = opts?.contentType ?? blob.type ?? "application/octet-stream";

    const buffer = Buffer.from(await blob.arrayBuffer());

    await this._s3.send(new PutObjectCommand({
      Bucket:      this._bucket,
      Key:         s3Key,
      Body:        buffer,
      ContentType: contentType,
    }));

    await this._pool.query(
      `INSERT INTO "${this._schema}"._iac_storage
         (storage_id, s3_key, bucket, content_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5)`,
      [storageId, s3Key, this._bucket, contentType, blob.size]
    );

    return storageId;
  }

  /**
   * Get a URL for a storageId.
   * Returns a presigned URL (expires in 1h) unless publicBase is set.
   */
  async getUrl(storageId: string): Promise<string | null> {
    const { rows } = await this._pool.query(
      `SELECT s3_key FROM "${this._schema}"._iac_storage WHERE storage_id = $1`,
      [storageId]
    );
    if (rows.length === 0) return null;

    const s3Key = rows[0].s3_key;

    if (this._publicBase) {
      return `${this._publicBase}/${s3Key}`;
    }

    return getSignedUrl(
      this._s3,
      new GetObjectCommand({ Bucket: this._bucket, Key: s3Key }),
      { expiresIn: 3600 }
    );
  }

  /** Delete a stored object */
  async delete(storageId: string): Promise<void> {
    const { rows } = await this._pool.query(
      `DELETE FROM "${this._schema}"._iac_storage WHERE storage_id = $1 RETURNING s3_key`,
      [storageId]
    );
    if (rows.length === 0) return;

    await this._s3.send(new DeleteObjectCommand({
      Bucket: this._bucket,
      Key:    rows[0].s3_key,
    }));
  }

  private _extFromType(contentType: string): string {
    const map: Record<string, string> = {
      "image/jpeg":      ".jpg",
      "image/png":       ".png",
      "image/webp":      ".webp",
      "image/gif":       ".gif",
      "application/pdf": ".pdf",
      "text/plain":      ".txt",
      "application/json":".json",
    };
    return map[contentType] ?? "";
  }
}
```

**Acceptance criteria:**
- `ctx.storage.store(blob)` uploads to S3, records metadata, returns storageId
- `ctx.storage.getUrl(storageId)` returns presigned URL or public URL
- `ctx.storage.delete(storageId)` removes from S3 and deletes metadata row
- Content-type preserved in S3 object
- storageId format: `st_` prefix + 20-char nanoid

---

### Task P2-16 — Wire `StorageCtx` into Function HTTP Router

**Depends on:** P2-15

**Modify file:** `packages/server/src/routes/betterbase/index.ts`

Replace the `buildStorageReader()` and `buildStorageWriter()` stubs:

```typescript
import { StorageCtx } from "@betterbase/core/iac/storage/storage-ctx";
import { validateEnv } from "../../lib/env";

function buildStorageCtx(pool: Pool, projectSlug: string): StorageCtx {
  const env = validateEnv();
  return new StorageCtx({
    pool,
    projectSlug,
    endpoint:    env.STORAGE_ENDPOINT ?? "http://minio:9000",
    accessKey:   env.STORAGE_ACCESS_KEY ?? "minioadmin",
    secretKey:   env.STORAGE_SECRET_KEY ?? "minioadmin",
    bucket:      env.STORAGE_BUCKET ?? "betterbase",
    publicBase:  env.STORAGE_PUBLIC_BASE,
  });
}

// In the route handler, replace stub calls:
const storage = buildStorageCtx(pool, projectSlug);

// Then pass storage to ctx:
// query ctx:    { db, auth, storage }
// mutation ctx: { db, auth, storage, scheduler }
// action ctx:   { auth, storage, scheduler, runQuery, runMutation }
```

**Add to `packages/server/src/lib/env.ts`** schema:

```typescript
STORAGE_PUBLIC_BASE: z.string().url().optional(),
```

**Acceptance criteria:**
- `ctx.storage` is a fully functional `StorageCtx` in all function kinds
- Reads storage config from existing env vars (already defined in SH-05)
- `STORAGE_PUBLIC_BASE` optional — if set, getUrl returns public URLs

---

### Task P2-17 — Browser Upload Endpoint

**Depends on:** P2-16

**What it is:** Direct browser upload flow. Client requests a presigned upload URL from the server, then POSTs the file directly to S3 — bypasses the server for large files.

**Add to `packages/server/src/routes/betterbase/index.ts`:**

```typescript
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { S3Client } from "@aws-sdk/client-s3";
import { requireAuth } from "../../lib/auth"; // authenticates the request
import { isSafeSlug } from "../../lib/slug"; // ^[a-z0-9][a-z0-9_-]{0,62}$

// POST /betterbase/storage/generate-upload-url
betterbaseRouter.post("/storage/generate-upload-url", requireAuth, async (c) => {
  const { contentType, filename } = await c.req.json();

  // Derive the authorized project from the authenticated context rather than
  // trusting the raw X-Project-Slug header. This prevents cross-project
  // targeting and identifier injection.
  const project = c.get("project") as { slug: string } | undefined;
  if (!project) return c.json({ error: "Forbidden" }, 403);

  // Validate the slug before using it in any identifier.
  if (!isSafeSlug(project.slug)) return c.json({ error: "Invalid project" }, 400);
  const projectSlug = project.slug;

  const storageId   = `st_${nanoid(20)}`;
  const ext         = filename?.split(".").pop() ?? "";
  const s3Key       = `project_${projectSlug}/${storageId}${ext ? "." + ext : ""}`;
  const env         = validateEnv();

  const s3 = new S3Client({
    endpoint:    env.STORAGE_ENDPOINT,
    region:      "us-east-1",
    credentials: { accessKeyId: env.STORAGE_ACCESS_KEY ?? "minioadmin", secretAccessKey: env.STORAGE_SECRET_KEY ?? "minioadmin" },
    forcePathStyle: true,
  });

  const { url, fields } = await createPresignedPost(s3, {
    Bucket:     env.STORAGE_BUCKET ?? "betterbase",
    Key:        s3Key,
    Conditions: [["content-length-range", 0, 100 * 1024 * 1024]], // 100MB max
    Expires:    300,  // 5 minute window
  });

  // Record the pending upload using the safe, validated schema helper (no raw
  // string interpolation of untrusted identifiers).
  const pool = getPool();
  await pool.query(
    `INSERT INTO betterbase_meta.project_storage (project_slug, storage_id, s3_key, bucket, content_type)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (storage_id) DO NOTHING`,
    [projectSlug, storageId, s3Key, env.STORAGE_BUCKET ?? "betterbase", contentType ?? "application/octet-stream"]
  );

  return c.json({ storageId, uploadUrl: url, fields });
});
```

**Client-side usage:**
```typescript
// In an action:
const { storageId, uploadUrl, fields } = await ctx.runQuery(api.actions.storage.getUploadUrl, {
  contentType: "image/png",
  filename:    "avatar.png",
});
// Then browser POSTs directly to uploadUrl with fields + file
```

**Acceptance criteria:**
- Returns presigned POST URL + fields for direct S3 upload
- `storageId` pre-registered in DB so `getUrl()` works immediately after upload
- 100MB upload limit enforced via S3 condition
- 5-minute URL expiry

---

## Phase E — Scheduler (Full Implementation)

### Task P2-18 — Scheduler Database Table

**Depends on:** P2-17

**Create file:** `packages/server/migrations/012_iac_scheduler.sql`

```sql
CREATE TABLE IF NOT EXISTS betterbase_meta.iac_scheduled_jobs (
  id             TEXT PRIMARY KEY,
  project_slug   TEXT NOT NULL,
  function_path  TEXT NOT NULL,     -- e.g. "mutations/users/sendDigest"
  args           JSONB NOT NULL DEFAULT '{}',
  run_at         TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
                 -- pending | running | completed | failed | cancelled
  attempts       INT NOT NULL DEFAULT 0,
  max_attempts   INT NOT NULL DEFAULT 3,
  error_msg      TEXT,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iac_jobs_run_at
  ON betterbase_meta.iac_scheduled_jobs (run_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_iac_jobs_project
  ON betterbase_meta.iac_scheduled_jobs (project_slug, status);
```

**Acceptance criteria:**
- Migration file numbered `012_` (after `011_iac_storage.sql`)
- Index on `run_at WHERE status = 'pending'` — fast worker poll
- `status` tracks full job lifecycle

---

### Task P2-19 — `SchedulerCtx` Full Implementation

**Depends on:** P2-18

**Create file:** `packages/core/src/iac/scheduler/scheduler-ctx.ts`

```typescript
import { nanoid } from "nanoid";
import type { Pool } from "pg";
import type { MutationRegistration } from "../functions";
import { z } from "zod";

export class SchedulerCtx {
  constructor(
    private _pool:        Pool,
    private _projectSlug: string
  ) {}

  /** Schedule a mutation to run after `delayMs` milliseconds */
  async runAfter<TArgs extends z.ZodRawShape>(
    delayMs:   number,
    fn:        MutationRegistration<TArgs, unknown>,
    args:      z.infer<z.ZodObject<TArgs>>
  ): Promise<string> {
    const runAt = new Date(Date.now() + delayMs);
    return this._schedule(fn, args, runAt);
  }

  /** Schedule a mutation to run at a specific timestamp */
  async runAt<TArgs extends z.ZodRawShape>(
    timestamp: Date,
    fn:        MutationRegistration<TArgs, unknown>,
    args:      z.infer<z.ZodObject<TArgs>>
  ): Promise<string> {
    return this._schedule(fn, args, timestamp);
  }

  /** Cancel a pending scheduled job */
  async cancel(jobId: string): Promise<void> {
    await this._pool.query(
      `UPDATE betterbase_meta.iac_scheduled_jobs
       SET status = 'cancelled'
       WHERE id = $1 AND project_slug = $2 AND status = 'pending'`,
      [jobId, this._projectSlug]
    );
  }

  private async _schedule(fn: any, args: unknown, runAt: Date): Promise<string> {
    const id   = nanoid();
    const path = fn.__bbfPath ?? "unknown";

    // Validate args before scheduling
    const parsed = fn._args.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid args for scheduled function ${path}: ${parsed.error.message}`);
    }

    await this._pool.query(
      `INSERT INTO betterbase_meta.iac_scheduled_jobs
         (id, project_slug, function_path, args, run_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [id, this._projectSlug, path, JSON.stringify(parsed.data), runAt]
    );

    return id;
  }
}
```

**Acceptance criteria:**
- `runAfter(5000, api.mutations.users.sendDigest, { userId })` inserts a row scheduled 5s from now
- `runAt(new Date("2027-01-01"), fn, args)` schedules for a specific future time
- `cancel(jobId)` only cancels `pending` jobs (not running/completed)
- Args validated against function's Zod schema before inserting
- Returns job ID for tracking/cancellation

---

### Task P2-20 — Scheduler Worker Loop

**Depends on:** P2-19

**Create file:** `packages/core/src/iac/scheduler/job-worker.ts`

```typescript
import type { Pool } from "pg";
import { DatabaseWriter } from "../db-context";
import { StorageCtx } from "../storage/storage-ctx";
import { SchedulerCtx } from "./scheduler-ctx";
import { lookupFunction } from "../function-registry";

const POLL_INTERVAL_MS  = 2_000;   // check every 2 seconds
const JOB_LOCK_TIMEOUT  = 30_000;  // jobs stuck in "running" for >30s are retried

export class JobWorker {
  private _running = false;
  private _timer:   ReturnType<typeof setInterval> | null = null;

  constructor(
    private _pool:          Pool,
    private _storageConfig: { endpoint: string; accessKey: string; secretKey: string; bucket: string }
  ) {}

  start() {
    if (this._running) return;
    this._running = true;
    this._timer   = setInterval(() => this._poll(), POLL_INTERVAL_MS);
    console.log("[scheduler] Worker started");
  }

  stop() {
    this._running = false;
    if (this._timer) clearInterval(this._timer);
  }

  private async _poll() {
    // Re-queue stuck running jobs first
    await this._pool.query(
      `UPDATE betterbase_meta.iac_scheduled_jobs
       SET status = 'pending', error_msg = 'Requeued after timeout'
       WHERE status = 'running'
         AND created_at < NOW() - INTERVAL '${JOB_LOCK_TIMEOUT} milliseconds'`
    ).catch(() => {});

    // Claim a batch of pending jobs
    const { rows } = await this._pool.query<{
      id: string; project_slug: string; function_path: string; args: unknown; attempts: number;
    }>(
      `UPDATE betterbase_meta.iac_scheduled_jobs
       SET status = 'running', attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM betterbase_meta.iac_scheduled_jobs
         WHERE status = 'pending' AND run_at <= NOW()
         ORDER BY run_at ASC
         LIMIT 10
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, project_slug, function_path, args, attempts`
    ).catch(() => ({ rows: [] as any[] }));

    for (const job of rows) {
      this._runJob(job).catch(console.error);
    }
  }

  private async _runJob(job: {
    id: string; project_slug: string; function_path: string; args: unknown; attempts: number;
  }) {
    const fn = lookupFunction(job.function_path);
    if (!fn) {
      await this._markFailed(job.id, `Function not found: ${job.function_path}`);
      return;
    }

    try {
      const schema    = `project_${job.project_slug}`;
      const db        = new DatabaseWriter(this._pool, schema);
      const storage   = new StorageCtx({ pool: this._pool, projectSlug: job.project_slug, ...this._storageConfig });
      const scheduler = new SchedulerCtx(this._pool, job.project_slug);
      const ctx       = { db, auth: { userId: null, token: null }, storage, scheduler };

      await (fn.handler as any)._handler(ctx, job.args);

      await this._pool.query(
        `UPDATE betterbase_meta.iac_scheduled_jobs
         SET status = 'completed', completed_at = NOW()
         WHERE id = $1`,
        [job.id]
      );
    } catch (err: any) {
      const maxAttempts = 3;
      if (job.attempts >= maxAttempts) {
        await this._markFailed(job.id, err.message);
      } else {
        // Exponential backoff retry: 2^attempts * 1s
        const retryDelay = Math.pow(2, job.attempts) * 1000;
        await this._pool.query(
          `UPDATE betterbase_meta.iac_scheduled_jobs
           SET status = 'pending', run_at = NOW() + INTERVAL '${retryDelay} milliseconds',
               error_msg = $2
           WHERE id = $1`,
          [job.id, err.message]
        );
      }
    }
  }

  private async _markFailed(id: string, msg: string) {
    await this._pool.query(
      `UPDATE betterbase_meta.iac_scheduled_jobs
       SET status = 'failed', error_msg = $2, completed_at = NOW()
       WHERE id = $1`,
      [id, msg]
    );
  }
}
```

**Start the worker in `packages/server/src/index.ts`:**

```typescript
import { JobWorker } from "@betterbase/core/iac/scheduler/job-worker";

// After migrations run:
const jobWorker = new JobWorker(pool, {
  endpoint:  env.STORAGE_ENDPOINT ?? "http://minio:9000",
  accessKey: env.STORAGE_ACCESS_KEY ?? "minioadmin",
  secretKey: env.STORAGE_SECRET_KEY ?? "minioadmin",
  bucket:    env.STORAGE_BUCKET ?? "betterbase",
});
jobWorker.start();
```

**Acceptance criteria:**
- Worker polls every 2 seconds using `FOR UPDATE SKIP LOCKED` (safe for multi-instance)
- Stuck jobs (running >30s) automatically re-queued
- Retry with exponential backoff: 1s, 2s, 4s, then `failed`
- Each job gets full `MutationCtx` (db, storage, scheduler, null auth)
- Worker stops cleanly on `SIGTERM`

---

### Task P2-21 — Wire `SchedulerCtx` into Function Router

**Depends on:** P2-20

**Modify file:** `packages/server/src/routes/betterbase/index.ts`

Replace the scheduler stub:

```typescript
import { SchedulerCtx } from "@betterbase/core/iac/scheduler/scheduler-ctx";

function buildSchedulerCtx(pool: Pool, projectSlug: string): SchedulerCtx {
  return new SchedulerCtx(pool, projectSlug);
}

// In the mutation and action ctx builders:
const scheduler = buildSchedulerCtx(pool, projectSlug);
```

**Acceptance criteria:**
- `ctx.scheduler.runAfter(5000, fn, args)` inserts a DB row and returns job ID
- `ctx.scheduler.cancel(id)` cancels a pending job
- No stubs remain in the betterbase router

---

## Phase F — Client Hooks (Complete Implementation)

### Task P2-22 — `ConvexProvider` Equivalent

**Depends on:** P2-21

**Create file:** `packages/client/src/iac/provider.tsx`

```typescript
import React, { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

export interface BBFConfig {
  /** Base URL of the BetterBase server */
  url:          string;
  /** Project slug — routes db queries to the right schema */
  projectSlug?: string;
  /** Token getter — called on each request */
  getToken?:    () => string | null;
}

interface BBFContextValue {
  config:   BBFConfig;
  ws:       WebSocket | null;
  wsReady:  boolean;
}

const BBFContext = createContext<BBFContextValue | null>(null);

export function BetterbaseProvider({ config, children }: { config: BBFConfig; children: ReactNode }) {
  const wsRef   = useRef<WebSocket | null>(null);
  const [wsReady, setWsReady] = React.useState(false);

  useEffect(() => {
    // Acquire a short-lived WebSocket ticket scoped to this project, then pass
    // it on the connection so the server can validate the project binding.
    const ticket = getWSTicket?.(config.projectSlug ?? "default");
    const wsUrl  = config.url.replace(/^http/, "ws") + `/betterbase/ws?project=${config.projectSlug ?? "default"}&ticket=${ticket ?? ""}`;
    const ws     = new WebSocket(wsUrl);

    ws.onopen  = () => { setWsReady(true); };
    ws.onclose = () => {
      setWsReady(false);
      // Reconnect after 3 seconds
      setTimeout(() => { wsRef.current = new WebSocket(wsUrl); }, 3_000);
    };

    wsRef.current = ws;

    // Handle pings
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
    };

    return () => { ws.close(); };
  }, [config.url, config.projectSlug]);

  return (
    <BBFContext.Provider value={{ config, ws: wsRef.current, wsReady }}>
      {children}
    </BBFContext.Provider>
  );
}

export function useBBFContext(): BBFContextValue {
  const ctx = useContext(BBFContext);
  if (!ctx) throw new Error("useBBFContext must be used inside <BetterbaseProvider>");
  return ctx;
}
```

**Usage:**
```tsx
// App root
import { BetterbaseProvider } from "@betterbase/client/iac";

<BetterbaseProvider config={{ url: "http://localhost:3001", projectSlug: "my-project" }}>
  <App />
</BetterbaseProvider>
```

**Acceptance criteria:**
- Single WebSocket per provider instance
- Auto-reconnects on disconnect (3s delay)
- Responds to server pings with pong
- Context throws if hooks used outside provider

---

### Task P2-23 — `useQuery` Full Implementation

**Depends on:** P2-22

**Replace file:** `packages/client/src/iac/hooks.ts`

```typescript
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { QueryRegistration, MutationRegistration, ActionRegistration } from "@betterbase/core/iac";
import { useBBFContext } from "./provider";

// ─── Internal fetch helper ────────────────────────────────────────────────────

async function callBBF<T>(
  baseUrl:     string,
  path:        string,
  args:        unknown,
  getToken?:   () => string | null,
  projectSlug?: string,
): Promise<T> {
  const token = getToken?.();
  const res   = await fetch(`${baseUrl}/betterbase/${path}`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(projectSlug ? { "X-Project-Slug": projectSlug } : {}),
    },
    body: JSON.stringify({ args }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }

  const { result } = await res.json();
  return result as T;
}

// ─── useQuery ────────────────────────────────────────────────────────────────

export type QueryStatus = "loading" | "success" | "error";

export interface UseQueryResult<T> {
  data:       T | undefined;
  status:     QueryStatus;
  isLoading:  boolean;
  isError:    boolean;
  error:      Error | null;
  refetch:    () => void;
}

export function useQuery<TReturn>(
  fn:   QueryRegistration<any, TReturn>,
  args: Record<string, unknown> = {}
): UseQueryResult<TReturn> {
  const { config, ws, wsReady } = useBBFContext();
  const path     = (fn as any).__bbfPath as string;
  const argsJson = useMemo(() => JSON.stringify(args), [JSON.stringify(args)]);

  const [data,   setData]   = useState<TReturn | undefined>(undefined);
  const [status, setStatus] = useState<QueryStatus>("loading");
  const [error,  setError]  = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("loading");
    try {
      const result = await callBBF<TReturn>(config.url, path, JSON.parse(argsJson), config.getToken, config.projectSlug);
      if (ctrl.signal.aborted) return;
      setData(result);
      setStatus("success");
      setError(null);
    } catch (e: any) {
      if (ctrl.signal.aborted) return;
      setError(e);
      setStatus("error");
    }
  }, [config.url, path, argsJson, config.getToken]);

  // Fetch on mount and args change
  useEffect(() => { fetchData(); }, [fetchData]);

  // Subscribe to invalidations via WebSocket
  useEffect(() => {
    if (!ws || !wsReady) return;

    ws.send(JSON.stringify({ type: "subscribe", path, args: JSON.parse(argsJson) }));

    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "invalidate" && msg.functionPath === path) {
        const msgArgsJson = JSON.stringify(msg.args);
        if (msgArgsJson === argsJson || msgArgsJson === "{}") {
          fetchData();
        }
      }
    };

    ws.addEventListener("message", handler);

    return () => {
      ws.removeEventListener("message", handler);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "unsubscribe", path, args: JSON.parse(argsJson) }));
      }
    };
  }, [ws, wsReady, path, argsJson, fetchData]);

  return {
    data,
    status,
    isLoading: status === "loading",
    isError:   status === "error",
    error,
    refetch:   fetchData,
  };
}

// ─── useMutation ─────────────────────────────────────────────────────────────

export interface UseMutationResult<TArgs, TReturn> {
  mutate:      (args: TArgs)                           => Promise<TReturn>;
  mutateAsync: (args: TArgs)                           => Promise<TReturn>;
  isPending:   boolean;
  isError:     boolean;
  error:       Error | null;
  reset:       () => void;
}

export function useMutation<TReturn = void>(
  fn: MutationRegistration<any, TReturn>
): UseMutationResult<Record<string, unknown>, TReturn> {
  const { config } = useBBFContext();
  const path = (fn as any).__bbfPath as string;

  const [isPending, setIsPending] = useState(false);
  const [error,     setError]     = useState<Error | null>(null);

  const mutateAsync = useCallback(async (args: Record<string, unknown>): Promise<TReturn> => {
    setIsPending(true);
    setError(null);
    try {
      const result = await callBBF<TReturn>(config.url, path, args, config.getToken, config.projectSlug);
      return result;
    } catch (e: any) {
      setError(e);
      throw e;
    } finally {
      setIsPending(false);
    }
  }, [config.url, path, config.getToken]);

  const mutate = useCallback((args: Record<string, unknown>) => {
    mutateAsync(args).catch(() => {}); // fire-and-forget variant
    return mutateAsync(args);
  }, [mutateAsync]);

  return {
    mutate,
    mutateAsync,
    isPending,
    isError: error !== null,
    error,
    reset: () => setError(null),
  };
}

// ─── useAction ────────────────────────────────────────────────────────────────

export function useAction<TReturn = void>(
  fn: ActionRegistration<any, TReturn>
): UseMutationResult<Record<string, unknown>, TReturn> {
  const { config } = useBBFContext();
  const path = (fn as any).__bbfPath as string;

  // Actions follow the same client pattern as mutations
  const mutationFn = { ...fn, __bbfPath: path } as unknown as MutationRegistration<any, TReturn>;
  return useMutation(mutationFn);
}
```

**Acceptance criteria:**
- `useQuery()` returns `{ data, status, isLoading, isError, error, refetch }`
- Re-fetches when args change (memoized JSON comparison)
- Subscribes to WS invalidation; re-fetches on matching invalidation
- Unsubscribes on unmount
- Aborts in-flight requests on args change (prevents stale state)
- `useMutation()` exposes both `mutate` (fire-and-forget) and `mutateAsync` (await-able)
- `useAction()` is identical to `useMutation()` from client perspective

---

### Task P2-24 — `usePaginatedQuery`

**Depends on:** P2-23

**Create file:** `packages/client/src/iac/paginated-query.ts`

```typescript
import { useState, useCallback } from "react";
import type { QueryRegistration } from "@betterbase/core/iac";
import { useBBFContext } from "./provider";

export interface PaginationStatus {
  isLoadingFirstPage: boolean;
  isLoadingMore:      boolean;
  isDone:             boolean;
}

export interface UsePaginatedQueryResult<T> {
  results:   T[];
  status:    "loading" | "success" | "error";
  pageSize:  number;
  loadMore:  () => void;
  isLoading: boolean;
  isDone:    boolean;
}

/**
 * Cursor-based paginated query hook.
 *
 * The query function must accept `{ cursor: string | null, numItems: number }` args
 * and return `{ page: T[], isDone: boolean, cursor: string | null }`.
 */
export function usePaginatedQuery<T>(
  fn:       QueryRegistration<any, { page: T[]; isDone: boolean; cursor: string | null }>,
  baseArgs: Record<string, unknown>,
  opts:     { initialNumItems?: number } = {}
): UsePaginatedQueryResult<T> {
  const { config } = useBBFContext();
  const path      = (fn as any).__bbfPath as string;
  const numItems  = opts.initialNumItems ?? 10;

  const [results,   setResults]   = useState<T[]>([]);
  const [cursor,    setCursor]    = useState<string | null>(null);
  const [isDone,    setIsDone]    = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [status,    setStatus]    = useState<"loading" | "success" | "error">("loading");

  // Initial load
  useState(() => {
    loadPage(null);
  });

  async function loadPage(cursor: string | null) {
    setIsLoading(true);
    try {
      const token = config.getToken?.();
      const res   = await fetch(`${config.url}/betterbase/${path}`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ args: { ...baseArgs, cursor, numItems } }),
      });
      const { result } = await res.json();
      setResults(prev => cursor === null ? result.page : [...prev, ...result.page]);
      setCursor(result.cursor);
      setIsDone(result.isDone);
      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      setIsLoading(false);
    }
  }

  const loadMore = useCallback(() => {
    if (!isDone && !isLoading) loadPage(cursor);
  }, [isDone, isLoading, cursor]);

  return { results, status, pageSize: numItems, loadMore, isLoading, isDone };
}
```

**Server-side pattern for paginated queries (`betterbase/queries/todos.ts`):**

```typescript
export const listTodosPaginated = query({
  args: {
    cursor:   v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit  = args.numItems ?? 10;

    // Deterministic ordering so pagination is stable across pages.
    const q = ctx.db.query("todos").order("desc", "_createdAt").order("desc", "_id");

    // Advance past the cursor: the cursor is the composite of the last item's
    // (_createdAt, _id). Compare lexically so successive loadMore() calls return
    // the next page instead of repeating the first one.
    let builder = q;
    if (args.cursor) {
      const [cursorCreated, cursorId] = args.cursor.split("|");
      builder = builder.filter("_createdAt", "lt", cursorCreated);
      builder = builder.filter("_id", "lt", cursorId);
    }

    const all    = await builder.take(limit + 1).collect();
    const isDone = all.length <= limit;
    const page   = all.slice(0, limit);
    // cursor = composite of last item (_createdAt + "|" + _id), passed back by the client
    const cursor = isDone ? null
      : `${page[page.length - 1]._createdAt}|${page[page.length - 1]._id}`;
    return { page, isDone, cursor };
  },
});
```

**Acceptance criteria:**
- `usePaginatedQuery()` accumulates pages on `loadMore()`
- Refreshing (cursor null) replaces results instead of appending
- `isDone: true` stops `loadMore()` from firing
- Works with the server-side cursor pattern shown above

---

### Task P2-25 — Vanilla (Non-React) Client

**Replace file:** `packages/client/src/iac/vanilla.ts`

```typescript
import type { QueryRegistration, MutationRegistration, ActionRegistration } from "@betterbase/core/iac";

export interface VanillaBBFClient {
  /** Call a query function and return the result */
  query<TReturn>(
    fn:   QueryRegistration<any, TReturn>,
    args: Record<string, unknown>
  ): Promise<TReturn>;

  /** Call a mutation function */
  mutation<TReturn>(
    fn:   MutationRegistration<any, TReturn>,
    args: Record<string, unknown>
  ): Promise<TReturn>;

  /** Call an action function */
  action<TReturn>(
    fn:   ActionRegistration<any, TReturn>,
    args: Record<string, unknown>
  ): Promise<TReturn>;

  /** Subscribe to invalidations for a query (non-React, returns unsubscribe fn) */
  subscribe(
    fn:       QueryRegistration<any, unknown>,
    args:     Record<string, unknown>,
    onChange: () => void
  ): () => void;

  /** Close the WebSocket connection */
  close(): void;
}

export function createBBFClient(opts: {
  url:          string;
  projectSlug?: string;
  getToken?:    () => string | null;
}): VanillaBBFClient {
  const { url, projectSlug = "default", getToken } = opts;
  let ws: WebSocket | null = null;
  const listeners = new Map<string, Set<() => void>>();

  function getWS(): WebSocket {
    if (ws?.readyState === WebSocket.OPEN) return ws;
    const ticket = getWSTicket?.(projectSlug);
    const wsUrl = url.replace(/^http/, "ws") + `/betterbase/ws?project=${projectSlug}&ticket=${ticket ?? ""}`;
    ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "ping") ws?.send(JSON.stringify({ type: "pong" }));
      if (msg.type === "invalidate") {
        const key = msg.functionPath;
        listeners.get(key)?.forEach(fn => fn());
      }
    };
    return ws;
  }

  async function call(kind: string, fn: any, args: unknown): Promise<unknown> {
    const path  = fn.__bbfPath ?? "unknown";
    const token = getToken?.();
    const res   = await fetch(`${url}/betterbase/${path}`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(projectSlug ? { "X-Project-Slug": projectSlug } : {}),
      },
      body: JSON.stringify({ args }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error((body as any).error);
    }
    return (await res.json()).result;
  }

  return {
    query:    (fn, args) => call("queries",   fn, args) as any,
    mutation: (fn, args) => call("mutations", fn, args) as any,
    action:   (fn, args) => call("actions",   fn, args) as any,

    subscribe(fn, args, onChange) {
      const path = (fn as any).__bbfPath ?? "unknown";
      if (!listeners.has(path)) listeners.set(path, new Set());
      listeners.get(path)!.add(onChange);

      const socket = getWS();
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "subscribe", path, args }));
      } else {
        socket.addEventListener("open", () => {
          socket.send(JSON.stringify({ type: "subscribe", path, args }));
        }, { once: true });
      }

      return () => {
        listeners.get(path)?.delete(onChange);
        ws?.send(JSON.stringify({ type: "unsubscribe", path, args }));
      };
    },

    close() { ws?.close(); },
  };
}
```

**Acceptance criteria:**
- Works in Node.js, Bun, Deno, browser — no React dependency
- `subscribe()` returns an unsubscribe function
- WebSocket is lazily created and reused
- `close()` tears down the WebSocket cleanly

---

### Task P2-26 — Update `packages/client` Exports

**Depends on:** P2-25

**Modify file:** `packages/client/src/index.ts`

```typescript
// Existing exports (auth, query-builder, realtime, storage)
export * from "./auth";
export * from "./client";
export * from "./query-builder";
export * from "./realtime";
export * from "./storage";

// IaC exports
export { BetterbaseProvider, useBBFContext } from "./iac/provider";
export { useQuery, useMutation, useAction }  from "./iac/hooks";
export { usePaginatedQuery }                  from "./iac/paginated-query";
export { createBBFClient }                   from "./iac/vanilla";
```

**Modify `packages/client/package.json`** — add subpath exports:

```json
{
  "exports": {
    ".":      "./src/index.ts",
    "./iac":  "./src/iac/index.ts"
  }
}
```

**Create file:** `packages/client/src/iac/index.ts`

```typescript
export { BetterbaseProvider, useBBFContext, type BBFConfig } from "./provider";
export { useQuery, useMutation, useAction, type UseQueryResult, type UseMutationResult } from "./hooks";
export { usePaginatedQuery, type UsePaginatedQueryResult } from "./paginated-query";
export { createBBFClient, type VanillaBBFClient } from "./vanilla";
```

**Acceptance criteria:**
- `import { useQuery } from "@betterbase/client/iac"` works
- `import { useQuery } from "@betterbase/client"` also works (re-exported)
- React imports only pulled in when using hooks (not in vanilla client)

---

### Task P2-27 — Client Integration Tests

**Depends on:** P2-26

**Create file:** `packages/client/test/iac.test.ts`

```typescript
import { describe, it, expect, mock } from "bun:test";
import { createBBFClient } from "../src/iac/vanilla";

// Mock WebSocket for tests
const mockWS = {
  send:             mock(() => {}),
  close:            mock(() => {}),
  readyState:       1, // OPEN
  addEventListener: mock(() => {}),
};
(globalThis as any).WebSocket = mock(() => mockWS);

describe("createBBFClient", () => {
  const client = createBBFClient({ url: "http://localhost:3001", projectSlug: "test" });

  it("constructs without error", () => {
    expect(client).toBeDefined();
    expect(typeof client.query).toBe("function");
    expect(typeof client.mutation).toBe("function");
    expect(typeof client.action).toBe("function");
    expect(typeof client.subscribe).toBe("function");
  });

  it("subscribe returns unsubscribe function", () => {
    const fn = { __bbfPath: "queries/todos/listTodos", _handler: async () => [] } as any;
    const unsub = client.subscribe(fn, {}, () => {});
    expect(typeof unsub).toBe("function");
    unsub(); // should not throw
  });
});
```

**Acceptance criteria:**
- Tests pass with `bun test packages/client/test/iac.test.ts`
- WebSocket is mocked — tests don't require a running server

---

## Phase G — Developer Documentation

### Task P2-28 — `docs/iac/` Documentation Files

**Depends on:** P2-27

**Create the following files:**

---

**Create file:** `docs/iac/01-introduction.md`

```markdown
# BetterBase IaC — Introduction

BetterBase IaC is a Convex-inspired layer that lets you define your **data model** and **server functions** in TypeScript, inside a `betterbase/` directory. The CLI handles schema migrations automatically.

## Why IaC?

| Old pattern | IaC pattern |
|---|---|
| Write Drizzle schema manually | Define tables with `defineSchema()` and `v.*` validators |
| Write Hono routes | Write `query()`, `mutation()`, `action()` functions |
| Run `drizzle-kit push` manually | Run `bb iac sync` (or let `bb dev` do it) |
| Fetch from client with raw `fetch()` | Use `useQuery()` / `useMutation()` hooks |

## Quick start

```bash
bb init my-app --iac
cd my-app
bun install
bb dev
```

Your server is running. Add a table, add a function, the client updates automatically.
```

---

**Create file:** `docs/iac/02-schema.md`

```markdown
# Defining Your Schema

Your data model lives in `betterbase/schema.ts`. You never write SQL.

## Basic example

```typescript
import { defineSchema, defineTable, v } from "@betterbase/core/iac";

export default defineSchema({
  users: defineTable({
    name:  v.string(),
    email: v.string(),
    role:  v.union(v.literal("admin"), v.literal("member")),
    plan:  v.optional(v.union(v.literal("free"), v.literal("pro"))),
  })
  .uniqueIndex("by_email", ["email"]),

  posts: defineTable({
    title:     v.string(),
    body:      v.string(),
    authorId:  v.id("users"),
    published: v.boolean(),
  })
  .index("by_author",    ["authorId"])
  .index("by_published", ["published", "_createdAt"]),
});
```

## Validators (`v.*`)

| Validator | TypeScript type | SQL type |
|---|---|---|
| `v.string()` | `string` | `TEXT` |
| `v.number()` | `number` | `REAL` |
| `v.boolean()` | `boolean` | `BOOLEAN` |
| `v.int64()` | `bigint` | `BIGINT` |
| `v.id("users")` | `string` (branded) | `TEXT` |
| `v.optional(v.string())` | `string \| undefined` | `TEXT` (nullable) |
| `v.array(v.string())` | `string[]` | `JSONB` |
| `v.object({...})` | object | `JSONB` |
| `v.union(v.literal("a"), v.literal("b"))` | `"a" \| "b"` | `TEXT` |
| `v.datetime()` | `string` (ISO 8601) | `TIMESTAMPTZ` |

## System fields

Every document automatically gets:
- `_id` — unique string ID (nanoid)
- `_createdAt` — `Date`
- `_updatedAt` — `Date` (updated by `ctx.db.patch`)

## Indexes

```typescript
.index("by_email", ["email"])            // standard index
.uniqueIndex("by_email", ["email"])      // unique constraint
.searchIndex("by_title", {              // full-text (future)
  searchField: "title",
  filterFields: ["published"],
})
```

## Applying changes

```bash
bb iac diff    # preview what would change
bb iac sync    # apply changes (generates SQL migration + Drizzle schema)
```

Destructive changes (DROP TABLE, DROP COLUMN, type changes) require `--force`:

```bash
bb iac sync --force
```
```

---

**Create file:** `docs/iac/03-functions.md`

```markdown
# Writing Functions

Functions are the API of your BetterBase app. There are three kinds.

## Queries — read data

```typescript
// betterbase/queries/users.ts
import { query } from "@betterbase/core/iac";
import { v } from "@betterbase/core/iac";

export const getUser = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db.get("users", args.id);
  },
});
```

- Read-only. `ctx.db` is a `DatabaseReader` — no insert/patch/delete.
- Real-time by default — clients automatically re-fetch when data changes.

## Mutations — write data

```typescript
// betterbase/mutations/users.ts
import { mutation } from "@betterbase/core/iac";
import { v } from "@betterbase/core/iac";

export const createUser = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("users", args);
  },
});
```

- Can read and write. `ctx.db` is a `DatabaseWriter`.
- Writes automatically invalidate subscribed queries.

## Actions — side effects

```typescript
// betterbase/actions/email.ts
import { action } from "@betterbase/core/iac";
import { v } from "@betterbase/core/iac";

export const sendWelcomeEmail = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.queries.users.getUser, { id: args.userId });
    await sendEmail(user.email, "Welcome!");
  },
});
```

- Can call external APIs, run queries, schedule mutations.
- Not transactional — use mutations for DB writes inside actions.

## `ctx` reference

| Property | Queries | Mutations | Actions |
|---|---|---|---|
| `ctx.db` | `DatabaseReader` | `DatabaseWriter` | — |
| `ctx.auth.userId` | ✓ | ✓ | ✓ |
| `ctx.storage` | read-only | read-write | read-write |
| `ctx.scheduler` | — | ✓ | ✓ |
| `ctx.runQuery()` | — | — | ✓ |
| `ctx.runMutation()` | — | — | ✓ |

## `ctx.db` API

```typescript
// Read
await ctx.db.get("users", id)                     // by ID, returns doc or null
await ctx.db.query("users")                       // starts a query builder
  .filter("email", "eq", "alice@example.com")
  .order("desc")
  .take(20)
  .collect()                                      // → T[]
  .first()                                        // → T | null
  .unique()                                       // → T | null (throws if >1)

// Write (mutations only)
await ctx.db.insert("users", { name: "Alice" })   // → id string
await ctx.db.patch("users", id, { name: "Bob" })  // partial update
await ctx.db.replace("users", id, data)           // full replace
await ctx.db.delete("users", id)                  // delete
```
```

---

**Create file:** `docs/iac/04-client-hooks.md`

```markdown
# Client Hooks

## Setup

Wrap your app with `<BetterbaseProvider>`:

```tsx
import { BetterbaseProvider } from "@betterbase/client/iac";

<BetterbaseProvider config={{ url: "http://localhost:3001", projectSlug: "my-project" }}>
  <App />
</BetterbaseProvider>
```

## `useQuery`

Real-time. Automatically re-fetches when server data changes.

```tsx
import { useQuery } from "@betterbase/client/iac";
import { api } from "../betterbase/_generated/api";

function UserProfile({ id }: { id: string }) {
  const { data: user, isLoading, error } = useQuery(api.queries.users.getUser, { id });

  if (isLoading) return <div>Loading...</div>;
  if (error)     return <div>Error: {error.message}</div>;
  return <div>{user?.name}</div>;
}
```

## `useMutation`

```tsx
import { useMutation } from "@betterbase/client/iac";
import { api } from "../betterbase/_generated/api";

function CreateUserForm() {
  const create = useMutation(api.mutations.users.createUser);

  return (
    <button
      onClick={() => create.mutateAsync({ name: "Alice", email: "alice@example.com" })}
      disabled={create.isPending}
    >
      {create.isPending ? "Creating..." : "Create User"}
    </button>
  );
}
```

## `useAction`

```tsx
import { useAction } from "@betterbase/client/iac";
import { api } from "../betterbase/_generated/api";

function WelcomeButton({ userId }: { userId: string }) {
  const sendEmail = useAction(api.actions.email.sendWelcomeEmail);

  return (
    <button onClick={() => sendEmail.mutate({ userId })}>
      Send Welcome Email
    </button>
  );
}
```

## `usePaginatedQuery`

```tsx
import { usePaginatedQuery } from "@betterbase/client/iac";
import { api } from "../betterbase/_generated/api";

function PostList() {
  const { results, loadMore, isDone, isLoading } =
    usePaginatedQuery(api.queries.posts.listPaginated, {}, { initialNumItems: 10 });

  return (
    <>
      {results.map(post => <PostCard key={post._id} post={post} />)}
      {!isDone && <button onClick={loadMore} disabled={isLoading}>Load more</button>}
    </>
  );
}
```

## Vanilla (non-React) client

```typescript
import { createBBFClient } from "@betterbase/client/iac";
import { api } from "./betterbase/_generated/api";

const client = createBBFClient({ url: "http://localhost:3001" });

const user = await client.query(api.queries.users.getUser, { id: "abc" });
await client.mutation(api.mutations.users.createUser, { name: "Alice", email: "a@b.com" });

// Subscribe to real-time updates
const unsub = client.subscribe(api.queries.users.getUser, { id: "abc" }, () => {
  // refetch logic
});
// Later:
unsub();
```
```

---

**Create file:** `docs/iac/05-storage.md`

```markdown
# Storage

## Storing files inside mutations/actions

```typescript
export const uploadAvatar = action({
  args: { userId: v.id("users"), imageData: v.bytes() },
  handler: async (ctx, args) => {
    const blob      = new Blob([Buffer.from(args.imageData, "base64")]);
    const storageId = await ctx.storage.store(blob, { contentType: "image/jpeg" });
    await ctx.runMutation(api.mutations.users.setAvatar, { userId: args.userId, storageId });
    return storageId;
  },
});
```

## Getting a URL

```typescript
export const getAvatarUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    return ctx.storage.getUrl(args.storageId);  // presigned URL, expires in 1h
  },
});
```

## Direct browser upload (large files)

For files >1MB, use the presigned upload endpoint to bypass the server:

```typescript
// 1. Get upload URL from action
const { storageId, uploadUrl, fields } = await fetch("/betterbase/storage/generate-upload-url", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ contentType: "image/png", filename: "photo.png" }),
}).then(r => r.json());

// 2. Upload directly to S3/MinIO
const formData = new FormData();
Object.entries(fields).forEach(([k, v]) => formData.append(k, v as string));
formData.append("file", fileInput.files[0]);
await fetch(uploadUrl, { method: "POST", body: formData });

// 3. Use storageId to reference the file in your data model
await client.mutation(api.mutations.posts.create, { imageId: storageId, ... });
```
```

---

**Create file:** `docs/iac/06-scheduler.md`

```markdown
# Scheduler

## Schedule a mutation to run later

```typescript
export const createPost = mutation({
  args: { title: v.string(), publishAt: v.optional(v.datetime()) },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("posts", { title: args.title, published: false });

    if (args.publishAt) {
      await ctx.scheduler.runAt(
        new Date(args.publishAt),
        api.mutations.posts.publishPost,
        { id }
      );
    }

    return id;
  },
});
```

## Delayed execution

```typescript
// Send a follow-up email 24h after signup
await ctx.scheduler.runAfter(
  24 * 60 * 60 * 1000,          // 24 hours in ms
  api.mutations.email.sendFollowUp,
  { userId }
);
```

## Cron jobs

```typescript
// betterbase/cron.ts
import { cron } from "@betterbase/core/iac";
import { api } from "./_generated/api";

cron("daily-digest", "0 8 * * *", api.mutations.email.sendDailyDigest, {});
cron("cleanup",      "*/30 * * * *", api.mutations.system.cleanExpiredSessions, {});
```

Supported schedule formats:
- `*/N * * * *` — every N minutes
- `0 * * * *` — every hour
- `0 H * * *` — daily at hour H UTC
```

---

**Create file:** `docs/iac/07-modules.md`

```markdown
# Modules (`src/modules/`)

Modules are shared server-side logic imported by your `betterbase/` functions.

## Rules

- **No Hono imports** — no `Context`, no `c.req`, no route handling
- **No `ctx.db` calls** — database access belongs in function handlers
- Pure TypeScript — accepts plain args, returns plain values
- Can be used by queries, mutations, and actions

## Example

```typescript
// src/modules/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWelcomeEmail(to: string, name: string) {
  await resend.emails.send({
    from: "hello@myapp.com",
    to,
    subject: `Welcome, ${name}!`,
    html: `<p>Thanks for signing up.</p>`,
  });
}
```

```typescript
// betterbase/mutations/users.ts
import { sendWelcomeEmail } from "../../src/modules/email";

export const createUser = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("users", args);
    await sendWelcomeEmail(args.email, args.name);
    return id;
  },
});
```

## What goes in modules

- Email sending (Resend, Nodemailer)
- Payment processing (Stripe SDK calls)
- Third-party API clients (OpenAI, Twilio)
- Shared validation logic
- Business rule helpers
```

---

**Acceptance criteria:**
- All 7 docs files created under `docs/iac/`
- Each file has working code examples that match the implemented APIs
- No placeholder text or `TODO` in examples

---

### Task P2-29 — README Update

**Depends on:** P2-28

**Modify file:** `README.md`

Add an "IaC Quick Start" section immediately after the current "Quick Start":

```markdown
## IaC Quick Start (Recommended)

BetterBase includes a Convex-inspired IaC layer. Define data + functions in TypeScript — no SQL, no hand-written routes.

```bash
bb init my-app --iac
cd my-app
bun install
bb dev
```

Your schema is in `betterbase/schema.ts`. Your functions are in `betterbase/queries/` and `betterbase/mutations/`. The CLI watches for changes and handles migrations automatically.

See [docs/iac/](docs/iac/) for the full guide.

### How it compares to the original BetterBase

| | Original pattern | IaC pattern |
|---|---|---|
| Data model | Drizzle schema (`.ts`) | `defineSchema()` + `v.*` validators |
| API | Hand-written Hono routes | `query()` / `mutation()` / `action()` functions |
| Migrations | `drizzle-kit push` manually | `bb iac sync` (or automatic in `bb dev`) |
| Client | Raw `fetch()` | `useQuery()` / `useMutation()` hooks |
| Real-time | Hand-wire WebSockets | Built-in (queries auto-subscribe) |

Both patterns are supported simultaneously. Add `betterbase/` to an existing project without touching existing routes.
```

**Acceptance criteria:**
- IaC section appears before the tech stack table
- Comparison table is accurate to actual implementation
- Link to `docs/iac/` is correct

---

### Task P2-30 — Update `CODEBASE_MAP.md`

**Depends on:** P2-29

**Modify file:** `CODEBASE_MAP.md`

Update the monorepo structure section to reflect Phase 2 additions:

```markdown
## IaC Layer (Phase 2)

The IaC layer adds the following to the monorepo:

### `packages/core/src/iac/`

| Module | Purpose |
|---|---|
| `validators.ts` | `v.*` Zod-backed validator primitives |
| `schema.ts` | `defineTable`, `defineSchema`, index builders |
| `schema-serializer.ts` | Schema → JSON for diffing |
| `schema-diff.ts` | Diff engine, destructive change detection |
| `functions.ts` | `query()`, `mutation()`, `action()` registration |
| `db-context.ts` | `DatabaseReader`, `DatabaseWriter`, query builder |
| `function-registry.ts` | File discovery, function lookup |
| `cron.ts` | Cron job registration |
| `generators/` | Drizzle schema gen, migration gen, API type gen |
| `realtime/subscription-tracker.ts` | Per-client subscription management |
| `realtime/invalidation-manager.ts` | Batched WS invalidation push |
| `realtime/table-dep-inferrer.ts` | Static table dependency analysis |
| `storage/storage-ctx.ts` | S3/MinIO storage context |
| `scheduler/scheduler-ctx.ts` | Job scheduling (runAfter, runAt, cancel) |
| `scheduler/job-worker.ts` | DB-backed job worker loop |

### `packages/client/src/iac/`

| Module | Purpose |
|---|---|
| `provider.tsx` | `<BetterbaseProvider>`, WS lifecycle |
| `hooks.ts` | `useQuery`, `useMutation`, `useAction` |
| `paginated-query.ts` | `usePaginatedQuery` cursor pagination |
| `vanilla.ts` | `createBBFClient` — non-React client |

### `templates/iac/`

IaC-first project template. Scaffolded via `bb init --iac`.

### `docs/iac/`

Seven documentation files covering schema, functions, client hooks, storage, scheduler, and modules.
```

**Also update the last-updated date at the top of `CODEBASE_MAP.md`** to the current date.

**Acceptance criteria:**
- All Phase 2 modules documented in the codebase map
- Table entries accurate to actual file paths
- Date updated

---

## Execution Summary

```
Phase A — Project Structure (P2-01 → P2-04)
  P2-01  src/modules/ convention + README
  P2-02  templates/iac/ IaC-first template + bb init --iac
  P2-03  Deprecate old boilerplate notice + migration guide
  P2-04  Context generator picks up betterbase/ functions

Phase B — bb dev Full Implementation (P2-05 → P2-08)
  P2-05  ProcessManager (child process, pipe, restart)
  P2-06  DevWatcher (debounced, event classified by kind)
  P2-07  bb dev command full rewrite
  P2-08  Dev error formatter (Zod errors, filtered stack traces)

Phase C — Real-Time System (P2-09 → P2-13)
  P2-09  WebSocket server with heartbeat (Bun native WS)
  P2-10  Table dependency inferrer (static analysis)
  P2-11  Batched invalidation (setImmediate flush)
  P2-12  subscriptionTracker metrics
  P2-13  Admin dashboard realtime stats wired up

Phase D — Storage Context (P2-14 → P2-17)
  P2-14  _iac_storage metadata table (migration 011)
  P2-15  StorageCtx full impl (store, getUrl, delete)
  P2-16  StorageCtx wired into betterbase router
  P2-17  Browser presigned upload endpoint

Phase E — Scheduler (P2-18 → P2-21)
  P2-18  iac_scheduled_jobs table (migration 012)
  P2-19  SchedulerCtx full impl (runAfter, runAt, cancel)
  P2-20  JobWorker (poll, SKIP LOCKED, retry, backoff)
  P2-21  SchedulerCtx wired into betterbase router

Phase F — Client Hooks (P2-22 → P2-27)
  P2-22  BetterbaseProvider + WS lifecycle
  P2-23  useQuery / useMutation / useAction full impl
  P2-24  usePaginatedQuery (cursor-based)
  P2-25  Vanilla non-React client
  P2-26  packages/client exports updated
  P2-27  Client integration tests

Phase G — Documentation (P2-28 → P2-30)
  P2-28  docs/iac/ — 7 MDX files
  P2-29  README update (IaC quick start section)
  P2-30  CODEBASE_MAP.md update
```

---

## Dependencies Checklist

Verify before starting Phase C (real-time):

| Dep | Package | Note |
|---|---|---|
| `@aws-sdk/s3-presigned-post` | packages/server | for P2-17 presigned POST |
| `@aws-sdk/s3-request-presigner` | packages/core | for P2-15 getUrl presigned GET |
| `@aws-sdk/client-s3` | packages/core | already in core — verify subpath |
| `react` | packages/client | P2-22 hooks require React |
| `bun:test` | packages/client | already available |

Migration numbering: after `010_delivery_invocation_logs.sql` (DB-06), next is `011_iac_storage.sql` (P2-14), then `012_iac_scheduler.sql` (P2-18). Confirm your migration runner applies these correctly.

---

## Critical Notes for Kilo

**P2-09 (WebSocket):** The Phase 1 spec used `hono/ws` which requires an adapter. Phase 2 switches to Bun's native WebSocket API via `Bun.serve()` with `websocket:` option. The `fetch` handler and `websocket` handler are passed together in the serve config. Do not use `upgradeWebSocket` from hono — use `server.upgrade(req)` directly.

**P2-11 (Batching):** `setImmediate` does not exist in Bun as a global — use `queueMicrotask()` or `Promise.resolve().then()` for the same "after current sync execution" behavior. Replace `setImmediate` with `queueMicrotask`.

**P2-20 (Worker):** `FOR UPDATE SKIP LOCKED` requires PostgreSQL 9.5+. The Docker image uses `postgres:16-alpine` — safe. In SQLite mode (dev without Postgres), skip the worker and log a warning.

**P2-23 (hooks):** The `useState` initializer trick on line `useState(() => { loadPage(null); })` is a workaround — use `useEffect(() => { loadPage(null); }, [])` instead for correctness.

*End of specification. 30 tasks across 7 phases. All tasks depend on IAC-01 through IAC-25 being complete.*
