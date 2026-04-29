# Self-Hosted Production Readiness Roadmap

A pragmatic technical audit scoped specifically for **self-hosted production** — teams running BetterBase on their own infrastructure (Docker Compose, VPS, or Kubernetes). This document strips away SaaS-scale distractions and focuses only on what is required to run a stable, secure, single-tenant instance that teams can confidently deploy and maintain.

## Executive Summary

BetterBase's self-hosted stack (Postgres, MinIO, Inngest, Nginx, server + dashboard) is already functional and deployable. The gaps between "it runs" and "a team can rely on it in production" are smaller than a generic SaaS audit would suggest.

| Pillar | Status | Real Blockers for Self-Hosting |
|--------|--------|-------------------------------|
| Security | Beta | Rate limiting, scope enforcement, HTML escaping |
| Stability | Beta | Transactional migrations, deep health checks, graceful shutdown |
| Operations | Alpha | Backups, Prometheus metrics, K8s manifests |
| Multi-Instance Scaling | Alpha | Redis bridge for WS + rate limits across replicas |
| Developer Experience | Good | React-only client is limiting but not production-blocking |

**Overall readiness: 80%.** The remaining 20% is operational hardening and multi-replica support. Several items from a generic enterprise audit are **not required** for self-hosting and have been intentionally excluded below.

---

## What We Are NOT Doing (Out of Scope)

These are valid features for a managed SaaS or unicorn-scale platform, but they are unnecessary overhead for teams self-hosting their own backend.

| Item | Why It's Excluded |
|------|-------------------|
| Read replica routing | Self-hosted teams scale vertically or use managed Postgres (Neon/RDS) which handles this |
| Multi-language SDKs (Python, Go, etc.) | TypeScript client is sufficient for v1; OpenAPI export can come later |
| React-free client SDK refactor | Important for DX, but not a production stability issue |
| API versioning (`/v1/`) | Self-hosted teams control their own upgrade cadence |
| OpenAPI/Swagger generation | Nice to have, but docs and examples are sufficient for self-hosted teams |
| Chaos engineering / failure injection | Overkill for typical self-hosted deployments |
| Circuit breakers | Single-tenant instances with local MinIO/Postgres do not need SaaS-style circuit breaking |
| Terraform / Pulumi IaC | Teams bring their own infrastructure; Docker Compose and K8s are the interface |
| One-click deploy scripts for Railway/Render/Fly | These platforms already support Docker; maintain official Compose instead |
| MFA / TOTP for admin accounts | A single team's admin login can be protected by SSO proxy or VPN in practice |
| IP allowlisting | Same as above — handled at the network/VPN layer for most self-hosted setups |
| Application-level column encryption | Postgres at-rest encryption is sufficient for single-tenant self-hosting |
| RS256 JWT / asymmetric signing | HS256 is fine when the secret is rotated and stored in container env/secrets |
| Replacing Neon CDC polling | Self-hosted teams can use standard Postgres with `LISTEN/NOTIFY`, which already works |

---

## 1. Security (Must-Have for Self-Hosting)

### 1.1 Rate Limiting on Auth Endpoints

**Gap:** The `rate_limits` table exists (`packages/server/migrations/019_rate_limits.sql`) but no middleware uses it. Admin login and device verification are vulnerable to brute force and credential stuffing.

**Evidence:**

```typescript
// packages/server/src/routes/admin/auth.ts
authRoutes.post("/login", async (c) => {
  // No rate limiting applied
});
```

**Required:**

1. Implement a sliding-window rate limiter backed by `betterbase_meta.rate_limits`.
2. Apply to `/admin/auth/login`, `/device/verify`, and `/device/token`.
3. Add progressive delays after repeated failures (5 min, 15 min, 1 hour).
4. Emit structured security events for audit logging.

### 1.2 API Key Scope Enforcement

**Gap:** API keys include `scopes` in the database (`008_api_keys.sql`), but `requireAdmin` middleware does not validate them. A read-only key currently grants full admin access.

**Evidence:**

```typescript
// packages/server/src/lib/admin-middleware.ts
if (keyRows.length === 0) return c.json({ error: "Invalid API key" }, 401);
// Scope check is missing
```

**Required:**

1. Add scope requirements to privileged routes.
2. Reject requests where the API key lacks the required scope.
3. Add tests proving scope-based denial.

### 1.3 HTML Injection in Device Verification

**Gap:** The device verification page interpolates `userCode` directly into HTML without escaping.

**Evidence:**

```typescript
// packages/server/src/routes/device/index.ts
`<input name="user_code" value="${userCode ?? ""}" required />`
```

**Required:**

1. Escape HTML entities (`<`, `>`, `"`, `&`) before interpolation.
2. Add `Content-Security-Policy: default-src 'self'` to the response.

### 1.4 Security Headers

**Gap:** No global security headers are set. Missing `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`.

**Required:**

1. Add a Hono middleware that sets:

```typescript
c.header("X-Content-Type-Options", "nosniff");
c.header("X-Frame-Options", "DENY");
c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
```

### 1.5 Secret Management

**Gap:** `.env.self-hosted.example` uses placeholder secrets. No validation enforces strong secrets or rotation.

**Required:**

1. Add startup validation: `BETTERBASE_JWT_SECRET` must be >= 32 chars and not a known weak value.
2. Document secret rotation procedure in [SELF_HOSTED.md](../../SELF_HOSTED.md).

---

## 2. Stability & Reliability

### 2.1 Transactional Migrations

**Gap:** The migration runner executes SQL without per-file transactions. A failed migration can leave the database in an inconsistent state.

**Evidence:**

```typescript
// packages/server/src/lib/migrate.ts
const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");
await pool.query(sql); // No BEGIN/COMMIT
await pool.query("INSERT INTO betterbase_meta.migrations (filename) VALUES ($1)", [file]);
```

**Required:**

1. Wrap each migration in `BEGIN; ... COMMIT;` with rollback on failure.
2. Abort server startup if any migration fails.
3. Add idempotency checks (`IF NOT EXISTS`) to all DDL.

### 2.2 Deep Health Checks

**Gap:** `/health` returns a static JSON object. It does not verify database connectivity, storage accessibility, or Inngest reachability.

**Required:**

1. Implement deep health checks:

```typescript
app.get("/health", async (c) => {
  const db = await checkDatabase();
  const storage = await checkStorage();
  const inngest = await checkInngest();
  const ok = db && storage && inngest;
  return c.json({ db, storage, inngest }, ok ? 200 : 503);
});
```

2. Add `/ready` (dependencies up, migrations complete) and `/live` (process alive) for orchestrators.

### 2.3 Graceful Shutdown

**Gap:** The server does not handle `SIGTERM`. In-flight requests and database connections may be dropped during restarts or deploys.

**Required:**

1. On `SIGTERM`, stop accepting new connections.
2. Wait for active requests to finish (with a timeout, e.g., 30s).
3. Close the `pg` pool and WebSocket server cleanly.
4. Exit with code 0.

### 2.4 E2E Test Suite

**Gap:** Extensive unit tests exist, but no end-to-end tests validate the full self-hosted stack (client → Nginx → server → Postgres → MinIO).

**Required:**

1. Add E2E tests for critical self-hosted flows:
   - Admin login → project creation → function call
   - Storage upload via signed URL
   - Realtime subscription over WebSocket
2. Run E2E tests in CI against `docker-compose.self-hosted.yml`.

---

## 3. Operations (Running It Day-to-Day)

### 3.1 Backup & Recovery

**Gap:** No automated backup strategy exists for Postgres or MinIO. Self-hosted teams are responsible for their own data but have no guidance or tooling.

**Required:**

1. Add a Postgres backup sidecar to `docker-compose.self-hosted.yml` (e.g., `pg_dump` cron or `wal-g`).
2. Document restore procedure in [SELF_HOSTED.md](../../SELF_HOSTED.md).
3. Add MinIO bucket versioning and replication guidance.

### 3.2 Metrics & Monitoring

**Gap:** No Prometheus metrics endpoint exists. Operators cannot observe request rates, error rates, or database latency.

**Required:**

1. Add `/metrics` endpoint exporting Prometheus format:
   - `http_requests_total` (method, route, status)
   - `db_query_duration_seconds`
   - `ws_connections_active`
2. Provide a Grafana dashboard JSON for self-hosted deployments.
3. Optionally add `docker-compose.observability.yml` with Prometheus + Grafana.

### 3.3 Log Aggregation

**Gap:** Pino logs are structured but not shipped anywhere by default. Debugging a multi-container self-hosted deployment is painful.

**Required:**

1. Document how to forward logs to Loki, Datadog, or CloudWatch.
2. Ensure `request_id` is present in every log line for traceability.

### 3.4 Upgrade Path

**Gap:** No documented procedure for upgrading a self-hosted instance to a new BetterBase release.

**Required:**

1. Document upgrade checklist:
   - Backup database
   - Pull new image / rebuild
   - Run migrations (automatic on startup)
   - Verify `/health`
2. Provide a `docker-compose.self-hosted.yml` that pins image tags for reproducible upgrades.

---

## 4. Multi-Instance Scaling (For Teams Running Multiple Replicas)

### 4.1 Shared State for WebSockets

**Gap:** WebSocket tickets and subscriptions are stored in-memory. If two server containers run behind a load balancer, a client connected to instance A will miss invalidations triggered on instance B.

**Required:**

1. Add optional Redis integration.
2. Use Redis for:
   - WebSocket ticket storage (instead of `Map`)
   - Cross-instance pub/sub for realtime invalidations
3. Document: "Run a single server container, or add Redis and run multiple."

### 4.2 Shared Rate Limiting

**Gap:** The `rate_limits` table is Postgres-backed (good), but if implemented as in-memory caching it would break across replicas. Ensure the implementation queries the database or uses Redis.

**Required:**

1. Implement rate limiting against Postgres or Redis so it works consistently across replicas.

### 4.3 Kubernetes Manifests

**Gap:** Only Docker Compose exists. Teams running K8s must write their own manifests.

**Required:**

1. Provide basic K8s manifests:
   - `Deployment` for `betterbase-server`
   - `Deployment` for dashboard (nginx)
   - `Service` and `Ingress`
   - `StatefulSet` or external managed Postgres note
2. Add a simple Helm chart with `values.yaml` for configuration.

---

## Implementation Roadmap

### Phase 1: Security & Stability (Weeks 1–3)

| Task | Severity | Deliverable |
|------|----------|-------------|
| Rate limiting middleware | Critical | `packages/server/src/middleware/rate-limit.ts` |
| Enforce API key scopes | Critical | Updated `requireAdmin` + tests |
| Transactional migrations | High | Updated `migrate.ts` with `BEGIN/COMMIT` |
| Escape HTML in device verify | High | Updated `device/index.ts` + CSP |
| Security headers middleware | Medium | Global Hono middleware |
| Deep health checks | High | `/health`, `/ready`, `/live` |
| Graceful shutdown | Medium | `SIGTERM` handler in server entry |

### Phase 2: Operations (Weeks 3–5)

| Task | Severity | Deliverable |
|------|----------|-------------|
| Prometheus `/metrics` | High | Metrics endpoint + Grafana dashboard |
| Backup sidecar + docs | High | Compose service + restore guide |
| E2E test suite | High | Tests against self-hosted Compose stack |
| Upgrade documentation | Medium | Update [SELF_HOSTED.md](../../SELF_HOSTED.md) |
| Log aggregation guide | Low | Docs for Loki/CloudWatch forwarding |

### Phase 3: Multi-Instance (Weeks 5–7)

| Task | Severity | Deliverable |
|------|----------|-------------|
| Redis integration for WS | Medium | Cross-instance pub/sub |
| Redis-backed rate limits | Medium | Shared state across replicas |
| Kubernetes manifests | Medium | `k8s/` directory + Helm chart |

---

## Acceptance Criteria for Self-Hosted Production

All of the following must be true to declare BetterBase **production-ready for self-hosting**:

1. **Auth abuse gate:** Login and device verification enforce rate limits and temporary lockouts.
2. **Scope gate:** API key scopes are enforced on protected routes.
3. **Migration gate:** Each migration executes atomically; startup aborts on failure.
4. **Health gate:** `/health` checks database, storage, and Inngest; `/ready` and `/live` exist.
5. **Shutdown gate:** Server handles `SIGTERM` gracefully without dropping in-flight requests.
6. **E2E gate:** Critical flows (auth, CRUD, storage, realtime) pass E2E tests in CI against the self-hosted Compose stack.
7. **Backup gate:** Automated Postgres backups are documented and runnable via Compose.
8. **Metrics gate:** Prometheus metrics are available at `/metrics` with a reference Grafana dashboard.

---

## Related

- [SELF_HOSTED.md](../../SELF_HOSTED.md) - Self-hosted deployment guide
- [Production Checklist](./production-checklist.md) - Pre-deployment checklist
- [Deployment](./deployment.md) - Deployment platform guides
- [Security Best Practices](./security-best-practices.md) - Security hardening
- [Hardening Review v3](../core/hardening-review-v3.md) - Backend security audit
