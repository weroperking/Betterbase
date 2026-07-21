import { mutation, v } from "@betterbase/core/iac";

/** Create a product. */
export const createProduct = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    priceCents: v.number(),
    currency: v.string(),
    sku: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("products", args);
  },
});

/** Add a product to a user's cart (creating the cart if needed). */
export const addToCart = mutation({
  args: {
    userId: v.string(),
    productId: v.id("products"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    let cart = await ctx.db
      .query("carts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!cart) {
      const cartId = await ctx.db.insert("carts", {
        userId: args.userId,
        status: "active",
      });
      cart = (await ctx.db.get("carts", cartId))!;
    }

    const existing = await ctx.db
      .query("cart_items")
      .withIndex("by_cart_product", (q) =>
        q.eq("cartId", cart!._id).eq("productId", args.productId),
      )
      .first();

    if (existing) {
      await ctx.db.patch("cart_items", existing._id, {
        quantity: existing.quantity + args.quantity,
      });
    } else {
      await ctx.db.insert("cart_items", {
        cartId: cart!._id,
        productId: args.productId,
        quantity: args.quantity,
      });
    }
    return cart!._id;
  },
});

/**
 * Checkout: converts the active cart into an order. The Stripe
 * PaymentIntent is created by a billing action that reads STRIPE_SECRET_KEY
 * from the environment — we only store the resulting id here, never the key.
 */
export const checkout = mutation({
  args: {
    userId: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cart = await ctx.db
      .query("carts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!cart) throw new Error("No active cart");

    const items = await ctx.db
      .query("cart_items")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .collect();

    if (items.length === 0) throw new Error("Cart is empty");

    // Resolve product prices and build order items.
    let totalCents = 0;
    const orderItems: { productId: string; quantity: number; priceCents: number }[] = [];
    for (const item of items) {
      const product = await ctx.db.get("products", item.productId);
      if (!product) continue;
      totalCents += product.priceCents * item.quantity;
      orderItems.push({
        productId: item.productId,
        quantity: item.quantity,
        priceCents: product.priceCents,
      });
    }

    const orderId = await ctx.db.insert("orders", {
      userId: args.userId,
      stripePaymentIntentId: args.stripePaymentIntentId,
      totalCents,
      currency: "usd",
      status: "pending",
    });

    for (const oi of orderItems) {
      await ctx.db.insert("order_items", { orderId, ...oi });
    }

    // Empty the cart.
    for (const item of items) {
      await ctx.db.delete("cart_items", item._id);
    }
    await ctx.db.delete("carts", cart._id);

    return orderId;
  },
});
