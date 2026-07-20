# modules/

Shared server-side logic imported by your `betterbase/` functions.

**Rules:**
- No Hono imports. No HTTP concepts (no `Context`, no `c.req`, no `c.json`).
- No direct DB calls. Use `ctx.db` inside your `betterbase/` functions instead.
- Pure TypeScript — accepts plain arguments, returns plain values.
- Can import from `@betterbase/core/iac` for types only.

**Example:**

```typescript
// src/modules/billing.ts
export function isTrialing(status: string): boolean {
  return status === "trialing";
}
```
