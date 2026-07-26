# modules/

Shared server-side logic imported by your `betterbase/` functions.

**Rules:**
- No Hono imports. No HTTP concepts (no `Context`, no `c.req`, no `c.json`).
- No direct DB calls. Use `ctx.db` inside your `betterbase/` functions instead.
- Pure TypeScript — accepts plain arguments, returns plain values.
- Can import from `@betterbase/core/iac` for types only.

**Example:**

```typescript
// src/modules/email.ts
export async function sendWelcomeEmail(to: string, name: string) {
  // ...nodemailer or Resend SDK call
}
```

```typescript
// betterbase/mutations/users.ts
import { mutation } from "@betterbase/core/iac";
import { v } from "@betterbase/core/iac";
import { sendWelcomeEmail } from "../../src/modules/email";

export const createUser = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("users", args);
    await sendWelcomeEmail(args.email, args.name);
    return id;
  },
});
```