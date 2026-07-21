import { defineSchema, defineTable, v } from "@betterbase/core/iac";

/**
 * Blog schema: posts, tags (many-to-many via a join table), and comments.
 * Posts use a full-text search index on title+content for search queries.
 */
export default defineSchema({
  posts: defineTable({
    title: v.string(),
    slug: v.string(),
    content: v.string(),
    authorId: v.optional(v.string()),
    published: v.boolean(),
  })
    .uniqueIndex("by_slug", ["slug"])
    .index("by_published", ["published", "_createdAt"])
    .searchIndex("search_posts", { searchField: "content" }),

  tags: defineTable({
    name: v.string(),
    slug: v.string(),
  })
    .uniqueIndex("by_slug", ["slug"]),

  post_tags: defineTable({
    postId: v.id("posts"),
    tagId: v.id("tags"),
  })
    .index("by_post", ["postId"])
    .index("by_tag", ["tagId"]),

  comments: defineTable({
    postId: v.id("posts"),
    authorId: v.optional(v.string()),
    authorName: v.optional(v.string()),
    body: v.string(),
  })
    .index("by_post", ["postId", "_createdAt"]),
});
