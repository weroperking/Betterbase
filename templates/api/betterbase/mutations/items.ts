import { mutation, v } from "@betterbase/core/iac";

/** Create an item with validated input. */
export const createItem = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    quantity: v.number(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("items", args);
  },
});

/** Update an existing item. */
export const updateItem = mutation({
  args: {
    id: v.id("items"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    quantity: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );
    await ctx.db.patch("items", id, patch);
    return ctx.db.get("items", id);
  },
});

/** Delete an item. */
export const deleteItem = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, args) => {
    await ctx.db.delete("items", args.id);
  },
});
