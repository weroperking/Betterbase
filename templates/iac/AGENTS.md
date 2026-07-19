# BetterBase IaC Operational Constraints

## Project: {{projectName}}

## ⚠️ CRITICAL: READ BEFORE ANY CODE CHANGES

This project operates under **strict Infrastructure-as-Code (IaC) enforcement**.
Violations will result in build/deployment failures.

## ALLOWED Operations

### 1. Schema Definition ONLY
- ✅ Edit `betterbase/schema.ts` to declare tables
- ✅ Use `v.string()`, `v.number()`, `v.id("table")`, etc.
- ✅ Add `.index()`, `.uniqueIndex()` declarations
- ✌️ Run `bb iac sync` to apply schema changes

### 2. Pure Functions ONLY
- ✅ Create files in `betterbase/queries/` (read-only operations)
- ✅ Create files in `betterbase/mutations/` (write operations)
- ✅ Create files in `betterbase/actions/` (side effects)
- ✅ Use `ctx.db.query()`, `ctx.db.get()`, `ctx.db.insert()`, etc.
- ✅ Import shared code from `src/modules/`

## PROHIBITED Operations

### ❌ Custom Hono Routes
```
src/routes/                  # NOT ALLOWED
└── users.ts                 # DELETE THIS - use betterbase/mutations/users.ts
```

All API endpoints must be defined as IaC functions that automatically expose
HTTP endpoints at `/betterbase/:kind/:path/:name`.

### ❌ Package.json Modifications
```
package.json                 # NOT ALLOWED TO MODIFY
```

Dependencies are managed automatically by:
- `bb deps install` — Installs required dependencies
- `bb deps update` — Updates to latest compatible versions
- Schema-driven dependency inference from `betterbase/schema.ts`

### ❌ Direct Database Access
```typescript
// ❌ WRONG - Direct SQL
import { db } from '../db';
await db.select().from(users);

// ✅ CORRECT - Use IaC context
await ctx.db.query("users").collect();
```

## Workflow for Changes

### Schema Changes
```bash
# 1. Edit betterbase/schema.ts
# 2. Run sync (auto-detects local config)
bb iac sync

# 3. Changes are automatically:
#    - Applied to local database
#    - Synced to @betterbase/server
#    - Available in production
```

### Function Changes
```bash
# 1. Create/edit files in betterbase/queries or betterbase/mutations
# 2. Changes hot-reload automatically in dev mode
# 3. For production: bb iac sync --production
```

## Project Structure Rules

### Module Directory (src/modules/)
- NO Hono imports (`import { Hono } from 'hono'` is forbidden)
- NO HTTP concepts (no `Context`, `c.req`, `c.json`)
- Pure TypeScript business logic only
- Reused by IaC functions via relative imports

### Generated Files

**`betterbase/_generated/*`** (auto-generated - never edit)
- `betterbase/_generated/api.d.ts` — Type-safe function API (regenerated on every sync)
- `betterbase/_generated/schema.json` — Serialized schema (regenerated on every sync)

**`src/db/schema.generated.ts`** (auto-generated — do not manually edit; changes should come from the generator)

## Violation Detection

The CLI will reject operations that violate these constraints:

```bash
# Detect and reject non-IaC patterns
bb validate-project
# Checks for:
# - Hono routes in src/routes/
# - Direct database imports
# - Unauthorized package.json changes
```

## Server Registration

When `bb iac sync` runs:
1. Detects local environment configuration (.env, betterbase.config.ts)
2. Registers/syncs with `@betterbase/server` automatically
3. No dashboard interaction required
4. Headed mode: manual approval via browser
5. Headless mode: auto-approval with API key