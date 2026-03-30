# BetterBase — Codebase Map

> Last updated: 2026-03-30

## Canonical Orientation Files

Use these as the primary entry points when navigating the repository:

1. `NOTICE.md` — project-level summary and legal notice.
2. `README.md` — product overview, positioning, and onboarding.
3. `CODEBASE_MAP.md` — architecture and repository map (this file).
4. `docs/README.md` — docs hub and topic index.
5. `SELF_HOSTED.md` — self-hosted operating model and deployment notes.

---

## What BetterBase Is

BetterBase is an AI-native Backend-as-a-Service monorepo centered on:

- **TypeScript-first backend development**.
- **IaC workflow** (`betterbase/` folder in user projects) with Convex-inspired primitives.
- **Core backend engine** (`@betterbase/core`) + **CLI** (`@betterbase/cli`) + **client SDK** (`@betterbase/client`).
- **Self-hosted control plane** (`@betterbase/server`) with a React dashboard (`apps/dashboard`).

---

## Monorepo Layout (Current)

```text
.
├── apps/
│   └── dashboard/                 # React admin dashboard (Vite)
├── cli-auth-page/                 # Static auth page used by CLI login flow
├── docker/
│   └── nginx/                     # NGINX reverse proxy config
├── docs/                          # Product, API, guides, examples, IaC docs
├── packages/
│   ├── cli/                       # @betterbase/cli
│   ├── client/                    # @betterbase/client
│   ├── core/                      # @betterbase/core
│   ├── server/                    # @betterbase/server (self-hosted admin API)
│   └── shared/                    # @betterbase/shared
├── scripts/                       # Utility scripts (e.g., test summary)
└── templates/
    ├── auth/                      # Auth-focused starter template
    ├── base/                      # Base starter template
    └── iac/                       # IaC-first starter template
```

---

## Workspace Packages

| Package | Path | Purpose |
|---|---|---|
| `@betterbase/cli` | `packages/cli` | `bb` command: init/dev/migrate/auth/storage/webhook/rls/iac workflows |
| `@betterbase/client` | `packages/client` | Browser/server SDK: auth, storage, realtime, query builder, IaC hooks |
| `@betterbase/core` | `packages/core` | Runtime primitives: IaC schema/functions, providers, GraphQL, RLS, storage, vector, webhooks |
| `@betterbase/server` | `packages/server` | Self-hosted admin/API service and project-scoped admin endpoints |
| `@betterbase/shared` | `packages/shared` | Shared constants/types/errors/utilities across workspace packages |

---

## `@betterbase/core` module map

`packages/core/src/` currently contains:

- `iac/` — schema/functions/validators, codegen, schema diff/serialization, cron, realtime invalidation helpers.
- `providers/` — provider adapters and type contracts (`postgres`, `neon`, `supabase`, `turso`, `planetscale`).
- `functions/` — bundling/deploy/local runtime orchestration.
- `graphql/` — schema generation, resolvers, HTTP server, SDL export, realtime bridge.
- `rls/` — policy scanner/generator/evaluator/auth bridge.
- `storage/` — S3-compatible adapter + policy/image tooling.
- `vector/` — embeddings + vector search primitives.
- `webhooks/` — schema, dispatcher, signer, integration/startup.
- `branching/` — branch types and branching data/storage helpers.
- `realtime/` — channel manager and realtime core.
- `config/`, `migration/`, `middleware/`, `logger/` — supporting infrastructure.

---

## `@betterbase/server` API surface (high-level)

`packages/server/src/routes/` is organized as:

- `admin/` — instance-level admin routes:
  - projects, users, auth, roles, logs, metrics, storage, webhooks, notifications, SMTP, API keys, Inngest, instance settings, audit, CLI sessions.
  - `admin/project-scoped/` — per-project admin routes for DB/functions/users/env/auth/webhooks/realtime/IaC.
- `betterbase/` — BetterBase API routes including websocket endpoint.
- `device/` — device auth flow routes.

Database migrations live in `packages/server/migrations/`.

---

## Dashboard (`apps/dashboard`)

- **Stack:** React + Vite + TypeScript + TanStack Query + React Router.
- **Structure:**
  - `src/pages/` — product pages (overview, logs, audit, storage, team, settings, project details and project sub-pages).
  - `src/components/` — UI primitives and reusable app components.
  - `src/lib/` — API client + utility/query-key helpers.
  - `src/layouts/`, `src/hooks/`, `src/routes.tsx` — app shell and routing.

---

## Templates

- `templates/base/` — baseline BetterBase starter (routes, db, middleware, auth, tests).
- `templates/auth/` — starter with auth-specific scaffolding.
- `templates/iac/` — IaC-first starter (`betterbase/schema.ts`, `queries/`, `mutations/`, `cron.ts`).

---

## Documentation Map

`docs/` currently contains:

- `getting-started/` — install/config/quick-start/first-project.
- `core/` — architecture modules (config, providers, functions, realtime, GraphQL, migration, middleware, logger, etc.).
- `features/` — product capability docs (database/auth/functions/storage/realtime/webhooks/graphql/rls).
- `iac/` — IaC deep dives (schema, hooks, scheduler, storage, modules, optimization, vector, portability).
- `api-reference/` — REST/GraphQL/client SDK/CLI command references.
- `guides/` — deployment, security, monitoring, scaling, rollout strategy.
- `examples/` — todo/blog/chat/ecommerce examples.
- `client/`, `cli/`, `templates/`, `shared/`, `test-project/` — focused area references.

---

## Deployment and Infra Files

Key deployment files at repository root:

- `Dockerfile` — monorepo image build.
- `Dockerfile.project` — project-level runtime image.
- `docker-compose.yml` — baseline local compose setup.
- `docker-compose.dev.yml` — development compose profile.
- `docker-compose.production.yml` — production compose profile.
- `docker-compose.self-hosted.yml` — self-hosted stack profile.
- `docker/nginx/nginx.conf` — reverse proxy config.
- `.env.example` and `.env.self-hosted.example` — env var templates.

---

## Notes on scope and drift

This map is intentionally **architecture-first** (not a full file manifest).
For exact inventory, use:

```bash
rg --files
```

That command is the source of truth for current tracked files.
