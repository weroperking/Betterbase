import { query } from "@betterbase/core/iac";
import { v } from "@betterbase/core/iac";

export const listTodos = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("todos").order("desc").take(100).collect();
  },
});

export const getTodo = query({
  args: { id: v.id("todos") },
  handler: async (ctx, args) => {
    return ctx.db.get("todos", args.id);
  },
});