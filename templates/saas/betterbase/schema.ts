import { defineSchema, defineTable, v } from "@betterbase/core/iac";

/**
 * SaaS schema: tenants (multi-tenancy), users, subscriptions, and a
 * Stripe-style payments table. Every tenant-scoped table carries a
 * `tenantId` field so functions can scope reads/writes per tenant.
 *
 * No fake API keys — Stripe fields only store references/ids returned by
 * Stripe, never secrets. The secret lives in STRIPE_SECRET_KEY (env only).
 */
export default defineSchema({
  tenants: defineTable({
    name: v.string(),
    slug: v.string(),
    plan: v.string(),
  })
    .index("by_slug", ["slug"])
    .uniqueIndex("by_slug_unique", ["slug"]),

  users: defineTable({
    tenantId: v.id("tenants"),
    email: v.string(),
    name: v.optional(v.string()),
    role: v.string(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_email", ["tenantId", "email"]),

  subscriptions: defineTable({
    tenantId: v.id("tenants"),
    userId: v.id("users"),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.string(),
    plan: v.string(),
    currentPeriodEnd: v.optional(v.datetime()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_stripe_customer", ["stripeCustomerId"]),

  // Stripe-style payment records. Only stores references, amounts, and
  // status — never the secret key.
  payments: defineTable({
    tenantId: v.id("tenants"),
    userId: v.id("users"),
    stripePaymentIntentId: v.optional(v.string()),
    amountCents: v.number(),
    currency: v.string(),
    status: v.string(),
    description: v.optional(v.string()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_user", ["tenantId", "userId"]),
});
