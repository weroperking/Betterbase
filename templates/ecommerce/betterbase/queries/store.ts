import { query, v } from "@betterbase/core/iac";

/** Browse active products, newest first. */
export const browseProducts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("active", true))
      .order("desc", "_createdAt")
      .take(limit)
      .collect();
  },
});

/** Get a single product by id. */
export const getProduct = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    return ctx.db.get("products", args.id);
  },
});

/** Get the current cart and its line items for a user. */
export const getCart = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let cart = await ctx.db
      .query("carts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!cart) return null;

    const items = await ctx.db
      .query("cart_items")
      .withIndex("by_cart", (q) => q.eq("cartId", cart!._id))
      .collect();
    return { cart, items };
  },
});

/** Get an order with its items. */
export const getOrder = query({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.id);
    if (!order) return null;
    const items = await ctx.db
      .query("order_items")
      .withIndex("by_order", (q) => q.eq("orderId", args.id))
      .collect();
    return { order, items };
  },
});

/** Full-text search products. */
export const searchProducts = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.query("products").search(args.query, { limit: 25 });
  },
});
