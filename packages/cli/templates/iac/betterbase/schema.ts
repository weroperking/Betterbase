import { defineSchema, defineTable, v } from "@betterbase/core/iac";

export default defineSchema({
  todos: defineTable({
    text:      v.string(),
    completed: v.boolean(),
    authorId:  v.optional(v.string()),
  })
  .index("by_author",    ["authorId"])
  .index("by_completed", ["completed", "_createdAt"]),
});