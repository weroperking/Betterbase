import { defineSchema, defineTable, v } from "@betterbase/core/iac";

/**
 * E-commerce schema: products, carts, cart items, orders, order items.
 * Amounts are stored in the smallest currency unit (cents).
 * Payment secrets are never stored — only Stripe references/ids.
 */
export default defineSchema({
  products: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    priceCents: v.number(),
    currency: v.string(),
    sku: v.string(),
    active: v.boolean(),
  })
    .index("by_sku", ["sku"])
    .uniqueIndex("by_sku_unique", ["sku"])
    .index("by_active", ["active"])
    .searchIndex("search_products", { searchField: "name" }),

  carts: defineTable({
    userId: v.optional(v.string()),
    status: v.string(),
  }).index("by_user", ["userId"]),

  cart_items: defineTable({
    cartId: v.id("carts"),
    productId: v.id("products"),
    quantity: v.number(),
  })
    .index("by_cart", ["cartId"])
    .index("by_cart_product", ["cartId", "productId"]),

  orders: defineTable({
    userId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    totalCents: v.number(),
    currency: v.string(),
    status: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  order_items: defineTable({
    orderId: v.id("orders"),
    productId: v.id("products"),
    quantity: v.number(),
    priceCents: v.number(),
  })
    .index("by_order", ["orderId"]),
});
