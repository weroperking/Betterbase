import { query, v } from "@betterbase/core/iac";

/**
 * List all users within a tenant. The tenant context is passed explicitly
 * via `tenantId` — functions are tenant-scoped by convention in this template.
 */
export const listUsers = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("users")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
  },
});

/**
 * Get the active subscription for a tenant.
 */
export const getSubscription = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("subscriptions")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .first();
  },
});

/**
 * List payments scoped to a tenant, newest first.
 */
export const listPayments = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("payments")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .order("desc", "_createdAt")
      .take(100)
      .collect();
  },
});
