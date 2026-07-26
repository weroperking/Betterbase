import { mutation } from "@betterbase/core/iac";
import { v } from "@betterbase/core/iac";

export const createTodo = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("todos", { text: args.text, completed: false });
  },
});

export const toggleTodo = mutation({
  args: { id: v.id("todos"), completed: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch("todos", args.id, { completed: args.completed });
  },
});

export const deleteTodo = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, args) => {
    await ctx.db.delete("todos", args.id);
  },
});