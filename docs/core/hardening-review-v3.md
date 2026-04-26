# Betterbase Backend/Core Hardening Review (v3)

## 1) Objective (final outcome)

Deliver a **backend-first security and reliability hardening baseline** for Betterbase, focused on:

- `packages/server` runtime and auth boundaries,
- database/migration safety,
- Docker/container defaults and edge proxying,
- operational protections for production readiness.

> Out of scope by request: dashboard/frontend quality review.

---

## 2) Scope map (what is reviewed)

### Included
- API/auth/device/admin flows (`packages/server/src/**`)
- Migration and schema lifecycle (`packages/server/src/lib/migrate.ts`, `packages/server/migrations/**`)
- Container/runtime and local infra defaults (`Dockerfile`, `docker-compose.yml`, `docker/nginx/nginx.conf`)

### Excluded
- Dashboard UX, styling, and frontend correctness (`apps/dashboard/**`)

---

## 3) Plan (how this review is executed)

1. **Synchronize branch state** before any edits (fetch/pull when tracking exists).
2. **Static backend attack-surface review**:
   - auth/session/device/token issuance,
   - admin routing and privilege checks,
   - secret handling and env defaults,
   - SQL use patterns and dynamic identifier safety.
3. **Docker and reverse-proxy hardening pass**:
   - insecure defaults,
   - exposed ports/services,
   - transport/auth boundaries.
4. **Reliability pass**:
   - migration atomicity,
   - logging correctness,
   - operational behavior under failure.
5. **Produce v3 documentation artifact** with severity, impact, evidence, and fixes.

---

## 4) Acceptance criteria vs non-acceptance criteria

### Accepted criteria
A review is accepted only if it:

- Prioritizes **critical/high backend risks first**,
- Lists concrete findings with **file-level evidence**,
- Proposes remediation that is actionable and ordered,
- Separates scope (core/backend) from excluded dashboard concerns,
- Defines objective pass/fail criteria for closure.

### Not accepted
A review is not accepted if it:

- Focuses mostly on frontend/dashboard problems,
- Gives generic best-practice lists without code evidence,
- Omits severity and business impact,
- Doesn’t define what “done” looks like.

---

## 5) Problem classes targeted in this review

- **Authentication hardening** (brute-force, token abuse, device flow safety)
- **Authorization hardening** (scope enforcement, privilege boundaries)
- **Input/output security** (HTML injection, unsafe interpolation)
- **Secrets/config hardening** (weak defaults, exposure risks)
- **Operational resilience** (migration safety, observability correctness)
- **Container/proxy hardening** (network exposure, transport/auth controls)

---

## 6) Findings (backend/core only)

## F-01 (HIGH): No brute-force/rate limiting on admin login and device verification

**Evidence**
- `/admin/auth/login` verifies credentials directly with no throttling/lockout/captcha/backoff. (`packages/server/src/routes/admin/auth.ts`)
- `/device/verify` form POST verifies admin credentials with no anti-automation controls. (`packages/server/src/routes/device/index.ts`)

**Impact**
- Enables online password guessing and credential stuffing against administrative entry points.

**Recommended fix**
1. Add IP + account-based rate limits (e.g., sliding window).
2. Add progressive delays/temporary lockouts after repeated failures.
3. Emit structured security events for failed auth attempts.

---

## F-02 (HIGH): API key scopes are stored but not enforced

**Evidence**
- API keys include `scopes` at creation and persistence. (`packages/server/src/routes/admin/api-keys.ts`, `packages/server/migrations/008_api_keys.sql`)
- Auth middleware validates key hash and expiration only; it does not evaluate `scopes` for route/action authorization. (`packages/server/src/lib/admin-middleware.ts`)

**Impact**
- A supposedly limited key can act as full-admin bearer credentials, breaking least-privilege expectations.

**Recommended fix**
1. Introduce route-level scope requirements (e.g., `requireScopes(["projects:read"])`).
2. Validate scopes in middleware before allowing handler execution.
3. Add tests proving denied access when scope is insufficient.

---

## F-03 (MEDIUM-HIGH): Reflected HTML injection risk in device verification page

**Evidence**
- `userCode` query param is interpolated directly into HTML input value without escaping. (`packages/server/src/routes/device/index.ts`)

**Impact**
- Crafted links can inject markup/script contexts depending on browser parsing behavior, risking phishing/session abuse in admin verification flow.

**Recommended fix**
1. Escape HTML entities for all interpolated values.
2. Prefer server-side templates with automatic escaping.
3. Add CSP headers and disable inline script where possible.

---

## F-04 (MEDIUM): Migration execution is not wrapped in per-file transactions

**Evidence**
- Migration runner executes raw SQL then records applied filename, without explicit transaction guards around each migration file. (`packages/server/src/lib/migrate.ts`)

**Impact**
- Partial migration failures can leave inconsistent schema states that are hard to recover in production rollouts.

**Recommended fix**
1. Wrap each migration in `BEGIN/COMMIT` with rollback on failure.
2. Abort startup if any migration fails.
3. Add idempotency checks for unsafe DDL operations.

---

## F-05 (MEDIUM): Insecure local Docker defaults can leak into non-local usage

**Evidence**
- Static/dev credentials and wide host port exposure in compose defaults (`5432`, `9000`, `9001`, `8288`) plus default passwords. (`docker-compose.yml`)

**Impact**
- If reused outside isolated local environments, these defaults materially increase compromise likelihood.

**Recommended fix**
1. Gate local-only config via explicit profile names and warnings.
2. Require strong secrets through `.env` for non-dev profiles.
3. Limit host port publishing to required services only.

---

## 7) Closure criteria for this hardening cycle

To mark this cycle complete, all must be true:

1. Login/device endpoints enforce rate limits and lockout policy.
2. API key scopes are enforced in middleware/route guards.
3. Device verification HTML interpolation is safely escaped.
4. Migration runner supports transactional per-file execution.
5. Container docs/config clearly separate local unsafe defaults from production-secure defaults.

---

## 8) Implementation priority order

1. **P0:** F-01, F-02
2. **P1:** F-03
3. **P2:** F-04, F-05

---

## 9) Summary

This v3 review identifies backend/core hardening gaps primarily in auth abuse resistance, authorization scope enforcement, HTML output safety, migration resilience, and Docker default safety posture. Addressing P0/P1 items first materially reduces compromise risk while improving operational confidence.

---

## 10) AI reviewer operating manual (for the next reviewing agent)

This section is intentionally prescriptive so another AI/code reviewer can continue this work with high consistency and low ambiguity.

### 10.1 Review intent

You are not only finding bugs. You are validating whether Betterbase can safely operate as:
- an internet-facing backend API,
- a multi-project control plane,
- a migration-driven data platform,
- and a containerized service.

### 10.2 Required review mindset

For every endpoint or subsystem, ask:
1. **Can an attacker reach this?**
2. **What identity context is assumed?**
3. **What authorization boundary is enforced?**
4. **What happens on repeated abuse/failure?**
5. **How does this fail in production under partial outage?**

If any answer is unclear, treat it as a review finding candidate.

### 10.3 Evidence standard (non-optional)

Every finding should include all of:
- exact file path(s),
- function/route names,
- exploit or failure path in 2–5 steps,
- business impact,
- concrete mitigation order (quick patch + durable fix).

Avoid generic “best-practice only” findings with no file-level proof.

---

## 11) Backend review blueprint by domain

Use this sequence to avoid missing critical areas.

### 11.1 Identity and authentication
- Admin login (`/admin/auth/login`)
- Setup flow (`/admin/auth/setup`)
- Device flow (`/device/code`, `/device/verify`, `/device/token`)
- Token issuance/validation (`signAdminToken`, `verifyAdminToken`)
- API key lifecycle and bearer handling

**What to catch**
- brute force/stuffing paths,
- token replay windows,
- missing audience/issuer constraints,
- no rotation/revocation strategy,
- secret leakage in logs/errors.

### 11.2 Authorization and tenancy boundaries
- `requireAdmin` middleware behavior for JWT vs API keys
- project-scoped routes and project attachment middleware
- actions that should require scoped permissions but do not

**What to catch**
- privilege escalation across routes,
- “scope exists in DB but not enforced” patterns,
- project hopping / IDOR possibilities,
- routes inheriting global admin access unintentionally.

### 11.3 Data and SQL safety
- dynamic schema/table identifier usage
- raw SQL interpolation (especially schema-qualified queries)
- migration sequencing and rollback resilience

**What to catch**
- unsafe identifier injection opportunities,
- inconsistent transaction handling,
- ordering collisions in migration naming,
- partial-apply states causing startup drift.

### 11.4 Output and interface safety
- HTML-rendering endpoints (device verification page)
- plain-text/HTML response interpolation
- error message leakage

**What to catch**
- reflected/stored injection risks,
- security header gaps (CSP/XFO/etc.),
- differential error behavior that aids attackers.

### 11.5 Container, proxy, and runtime posture
- `docker-compose.yml` defaults
- nginx routing and trust headers
- image pinning and exposed ports

**What to catch**
- weak default credentials reused outside dev,
- unintended public service exposure,
- over-trusting forwarded headers,
- missing TLS/security hardening assumptions in docs.

---

## 12) Severity rubric for this project

Use this rubric consistently for triage:

- **Critical**: direct compromise of admin control plane, tenant data exposure, or remote code/data integrity impact with low attacker cost.
- **High**: realistic unauthorized access path, major authz bypass, or high-probability account compromise vector.
- **Medium**: meaningful security/reliability weakness requiring additional conditions.
- **Low**: hygiene/documentation/observability issues with limited direct exploitability.

When uncertain between two severities, choose the higher one and justify assumptions.

---

## 13) Acceptance gates for a “secure-enough” next milestone

The next implementation PR(s) should not be accepted unless all gates pass:

1. **Auth abuse gate**
   - login + device verification endpoints have measurable rate limiting and lockout/backoff.
2. **Authorization gate**
   - API key scopes are enforceable and tested on representative privileged routes.
3. **Injection gate**
   - user-controlled values rendered in HTML are escaped or template-engine protected.
4. **Migration safety gate**
   - each migration file executes atomically with rollback on failure.
5. **Runtime hygiene gate**
   - local-only insecure defaults are explicitly isolated from production paths.

---

## 14) Reviewer handoff format (for future AI agents)

When handing off to another reviewer/engineer, provide:

1. **Top-5 unresolved risks** (ordered by exploitability × impact),
2. **Proof snippets** (route/file/line references),
3. **Proposed patch plan** split by:
   - immediate hotfixes (hours),
   - short-term hardening (days),
   - structural improvements (weeks),
4. **Regression checks** that must run after each fix,
5. **Known blind spots** (areas not fully reviewed).

This prevents review drift and keeps findings actionable.

---

## 15) Suggested follow-up implementation roadmap (non-doc work)

1. Implement centralized rate-limit middleware for auth-sensitive endpoints.
2. Introduce explicit scope policy map and enforce in `requireAdmin`/route guards.
3. Add safe HTML escaping helper for any server-rendered templates.
4. Refactor migration runner to transactional execution with deterministic failure logging.
5. Add a production-hardening compose profile and deployment checklist.

These implementation tracks should be handled in dedicated code PRs with tests.
