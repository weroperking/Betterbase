import { mutation, v } from "@betterbase/core/iac";

/** Create a post. */
export const createPost = mutation({
  args: {
    title: v.string(),
    slug: v.string(),
    content: v.string(),
    authorId: v.optional(v.string()),
    published: v.boolean(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("posts", args);
  },
});

/** Add a comment to a post. */
export const addComment = mutation({
  args: {
    postId: v.id("posts"),
    authorId: v.optional(v.string()),
    authorName: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("comments", args);
  },
});

/** Attach a tag to a post (idempotent-ish link). */
export const tagPost = mutation({
  args: { postId: v.id("posts"), tagId: v.id("tags") },
  handler: async (ctx, args) => {
    return ctx.db.insert("post_tags", args);
  },
});
