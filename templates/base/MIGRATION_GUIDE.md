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