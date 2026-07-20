import { mutation, v } from "@betterbase/core/iac";

/**
 * Create a new tenant (a SaaS "organization" / workspace).
 */
export const createTenant = mutation({
  args: { name: v.string(), slug: v.string(), plan: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("tenants", args);
  },
});

/**
 * Invite a user into a tenant with a role.
 */
export const createUser = mutation({
  args: {
    tenantId: v.id("tenants"),
    email: v.string(),
    name: v.optional(v.string()),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("users", args);
  },
});

/**
 * Record a subscription for a tenant. The Stripe customer/subscription IDs
 * come from your billing integration (which reads STRIPE_SECRET_KEY from env).
 * We never store the secret key here.
 */
export const createSubscription = mutation({
  args: {
    tenantId: v.id("tenants"),
    userId: v.id("users"),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.string(),
    plan: v.string(),
    currentPeriodEnd: v.optional(v.datetime()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("subscriptions", args);
  },
});

/**
 * Record a successful payment. Amounts are stored in the smallest currency
 * unit (cents) to avoid float rounding issues.
 */
export const recordPayment = mutation({
  args: {
    tenantId: v.id("tenants"),
    userId: v.id("users"),
    stripePaymentIntentId: v.optional(v.string()),
    amountCents: v.number(),
    currency: v.string(),
    status: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("payments", args);
  },
});
