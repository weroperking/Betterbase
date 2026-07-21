import { query, v } from "@betterbase/core/iac";

/** List items, optionally filtered by status. */
export const listItems = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.status !== undefined) {
      return ctx.db
        .query("items")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    }
    return ctx.db.query("items").order("desc", "_createdAt").take(100).collect();
  },
});

/** Get a single item by id. */
export const getItem = query({
  args: { id: v.id("items") },
  handler: async (ctx, args) => {
    return ctx.db.get("items", args.id);
  },
});

/** Full-text search items by name. */
export const searchItems = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.query("items").search(args.query, { limit: 50 });
  },
});
