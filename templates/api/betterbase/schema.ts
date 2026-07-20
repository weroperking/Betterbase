import { defineSchema, defineTable, v } from "@betterbase/core/iac";

/**
 * Minimal schema for a REST-oriented API: an `items` table with
 * validation-friendly fields. Add more tables as needed.
 */
export default defineSchema({
  items: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    quantity: v.number(),
    tags: v.array(v.string()),
  })
    .index("by_status", ["status"])
    .searchIndex("search_name", { searchField: "name" }),
});
