# AGENTS.md — BetterBase Repository Operating Guide

## Mission Context
This repository contains planning artifacts and the early implementation scaffold for **BetterBase**:
- An AI-native backend platform inspired by Supabase.
- Built with a **TypeScript-first** developer experience.
- Runtime and tooling emphasis: **Bun**, Turborepo, Drizzle, BetterAuth, Hono.

## Assistant Identity / Model Context
- If asked which model is running, reply with the runtime-configured model identifier when available; otherwise provide a neutral capability-focused response.

## Current Strategic Inputs
Primary planning docs to align with before implementation:
- `betterbase_blueprint.md`
- `betterbase_reuse_strategy.md`

## Persistent Project Prompt (Apply to Every New Task)
Use and preserve the following project prompt context for future BetterBase implementation tasks:

PROJECT: BetterBase - AI-Native Backend Framework  
STACK: Bun + TypeScript + Hono + Drizzle ORM + SQLite (local) / Postgres (production)

PHILOSOPHY:
- AI-first: Generate `.betterbase-context.json` for AI agents to read
- Docker-less: Use `bun:sqlite` for <100ms startup
- Zero lock-in: Users own their schemas
- Type-safe: Strict TypeScript, Zod validation everywhere

BASE APP STRUCTURE:
- `/src/db` (`schema.ts`, `index.ts`)
- `/src/routes` (API endpoints)
- `/src/middleware` (auth, validation)
- `/src/lib` (utilities)
- `betterbase.config.ts`
- `drizzle.config.ts`

## Engineering Defaults
1. **Runtime:** Bun (prefer Bun commands and Bun workspaces).
2. **Language:** TypeScript in strict mode.
3. **Monorepo:** Turborepo with `apps/*` and `packages/*`.
4. **Core stack direction:**
   - API/server templates: Hono
   - ORM/migrations: Drizzle
   - Auth direction: BetterAuth
5. **Approach:** Reuse Better-T-Stack patterns where strategic, build BetterBase-differentiating features from scratch.

## Repository Structure Guidance
When scaffolding implementation, use:
- `betterbase/packages/cli` → canonical `bb` CLI implementation
- `betterbase/apps/cli` → legacy wrapper/stub (delegates to package CLI)
- `betterbase/apps/dashboard` → dashboard app
- `betterbase/packages/core` → backend/core engine
- `betterbase/packages/client` → `@betterbase/client`
- `betterbase/packages/shared` → shared utilities/types
- `betterbase/templates/base` → base starter template
- `betterbase/templates/auth` → auth starter template

## Workflow Rules for Agents
1. Read this file and planning docs before major code generation.
2. Keep changes incremental and commit in logical units.
3. Prefer small, composable files and clear package boundaries.
4. Avoid introducing lock-in assumptions that conflict with BetterBase goals.
5. When uncertain, bias toward the blueprint and reuse strategy docs.
6. Ensure new templates follow the persistent project prompt above.

## Quality & Validation
- Run lightweight checks whenever possible (format/lint/typecheck when available).
- Keep generated scaffolding runnable with Bun commands.

## Documentation Expectations
- Update docs when structure or commands change.
- Keep command examples Bun-first.
