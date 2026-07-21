# modules/

Shared server-side logic imported by your `betterbase/` functions.

**Rules:**
- No Hono imports. No HTTP concepts (no `Context`, no `c.req`, no `c.json`).
- No direct DB calls. Use `ctx.db` inside your `betterbase/` functions instead.
- Pure TypeScript — accepts plain arguments, returns plain values.
- Can import from `@betterbase/core/iac` for types only.

**Example:**

```typescript
// src/modules/pricing.ts
export function computeTotal(items: { priceCents: number; quantity: number }[]): number {
  return items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);
}
```
