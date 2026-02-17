# Base Template (Bun + TypeScript + Hono + Drizzle)

Starter template aligned to BetterBase defaults:
- Bun runtime
- TypeScript strict mode
- Hono API server
- Drizzle ORM with SQLite local default
- Zod available for request validation

## Structure

```txt
src/
  db/
    index.ts
    schema.ts
  routes/
    index.ts
    health.ts
    users.ts
  middleware/
    validation.ts
  lib/
    env.ts
  index.ts
betterbase.config.ts
drizzle.config.ts
```
