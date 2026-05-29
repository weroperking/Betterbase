# BetterBase IaC Migration Project Charter

> **Version:** 1.0.0  
> **Status:** Approved  
> **Date:** 2026-05-28  
> **Reference:** [BetterBase_IaC_Transition_Spec.md](BetterBase_IaC_Transition_Spec.md)

---

## 1. Project Overview and Objectives

### 1.1 Purpose
Transition BetterBase CLI from optional Infrastructure-as-Code (IaC) to strict IaC-by-default with headless environment synchronization. This migration establishes IaC as the sole development paradigm for all BetterBase projects.

### 1.2 Objectives
- **Primary:** Make IaC the default and only project initialization mode
- **Secondary:** Enable automatic headless synchronization between CLI projects and `@betterbase/server`
- **Tertiary:** Provide clear operational constraints for AI agents through AGENTS.md

### 1.3 Scope
| In Scope | Out of Scope |
|----------|--------------|
| CLI template restructuring | UI dashboard changes |
| Headless sync protocol | Third-party integrations |
| AGENTS.md constraint enforcement | Mobile SDK updates |
| Legacy project migration tooling | Breaking changes post-migration |

---

## 2. Key Architectural Changes

### 2.1 IaC Enforcement
- **Templates:** Restructure `templates/` to IaC-first, remove legacy Hono route patterns
- **Init Command:** Modify `bb init` to IaC-only (eliminate `--iac` flag)
- **Constraints:** Generate `AGENTS.md` with explicit IaC operational rules

### 2.2 Headless Synchronization
- **Environment Detection:** Auto-parse `.env` files and `betterbase.config.ts`
- **Server Registration:** Auto-register projects with `@betterbase/server`
- **Schema Sync:** Bidirectional schema synchronization during `bb iac sync`
- **Authentication:** Headless login via `--api-key` for non-interactive environments

### 2.3 New Components
| Component | File | Purpose |
|-----------|------|---------|
| `bb validate-project` | `packages/cli/src/commands/validate.ts` | IaC compliance validation |
| `env-detector.ts` | `packages/cli/src/commands/iac/env-detector.ts` | Environment configuration parsing |
| `server-sync.ts` | `packages/cli/src/commands/iac/server-sync.ts` | Server synchronization protocol |
| `iac-sync.ts` | `packages/server/src/routes/admin/project-scoped/iac-sync.ts` | Server API endpoints |

---

## 3. Implementation Phases and Timeline

### Phase 1: IaC Enforcement (Week 1-2)
- [x] Remove `--iac` flag from `bb init` command
- [x] Update init command to use IaC templates exclusively
- [x] Create AGENTS.md constraint template
- [x] Implement project validation command
- [x] Remove legacy template support (templates/base preserved for reference)

### Phase 2: Headless Sync Foundation (Week 2-3)
- [x] Implement environment configuration detection (env-detector.ts)
- [x] Extend API client with registration/schema endpoints
- [x] Create server-side IaC sync endpoints (iac-sync.ts)
- [x] Add headless authentication support (login.ts + api-client.ts)

### Phase 3: Full Auto-Sync (Week 3-4)
- [x] Integrate server sync into `bb iac sync` command (--headless, --auto-register options)
- [x] Add environment configuration synchronization
- [x] Implement automatic project registration
- [x] Add comprehensive error handling and logging

### Phase 4: Testing & Documentation (Week 4)
- [ ] Update all existing documentation
- [x] Create migration guide for legacy projects (migrate-legacy.ts tool)
- [ ] Implement validation test suite
- [ ] Performance benchmarking

---

## 4. Success Criteria

### 4.1 Quantitative Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Project Creation Time | < 30 seconds | CLI execution time |
| Migration Success Rate | > 95% | Legacy projects migratable |
| Sync Performance | < 5 seconds | Headless sync execution |
| Constraint Violations | Reduced 90% | AGENTS.md adoption rate |
| Error Reduction | Reduced 80% | Clear messaging effectiveness |

### 4.2 Qualitative Criteria
- [ ] All new projects default to IaC-only mode
- [ ] Headless sync works without dashboard intervention
- [ ] AGENTS.md clearly constrains AI agent operations
- [ ] Legacy projects can migrate with single command
- [ ] No breaking changes for compliant projects

### 4.3 Acceptance Criteria
- `bb init` produces IaC-compliant project structure
- `bb iac sync --headless` syncs schema and environment without prompts
- `bb validate-project` detects and reports constraint violations
- Migration tool successfully converts legacy Hono projects

---

## 5. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Legacy project incompatibility | Provide automated migration tool |
| Headless sync security concerns | Encrypted API keys, rate limiting, scoped permissions |
| Developer adoption resistance | Clear documentation and migration guide |

---

## 6. Stakeholders

| Role | Responsibility |
|------|---------------|
| CLI Maintainers | Template updates, command modifications |
| Server Team | API endpoint implementation, auth extensions |
| Documentation | Migration guides, updated docs |
| QA Team | Validation tests, performance benchmarks |