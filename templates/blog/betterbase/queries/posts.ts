import { query, v } from "@betterbase/core/iac";

/** List published posts, newest first. */
export const listPosts = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("posts")
      .withIndex("by_published", (q) => q.eq("published", true))
      .order("desc", "_createdAt")
      .take(50)
      .collect();
  },
});

/** Get a single post by slug. */
export const getPost = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("posts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

/** List posts that have a given tag (by tag slug). */
export const listByTag = query({
  args: { tagSlug: v.string() },
  handler: async (ctx, args) => {
    const tag = await ctx.db
      .query("tags")
      .withIndex("by_slug", (q) => q.eq("slug", args.tagSlug))
      .unique();
    if (!tag) return [];

    const links = await ctx.db
      .query("post_tags")
      .withIndex("by_tag", (q) => q.eq("tagId", tag._id))
      .collect();

    const postIds = links.map((l) => l.postId);
    const posts = await Promise.all(postIds.map((id) => ctx.db.get("posts", id)));
    return posts.filter((p): p is NonNullable<typeof p> => p !== null);
  },
});

/** List comments for a post, oldest first. */
export const listComments = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .order("asc", "_createdAt")
      .collect();
  },
});

/** Full-text search posts. */
export const searchPosts = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.query("posts").search(args.query, { limit: 25 });
  },
});
