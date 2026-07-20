import { query, v } from "@betterbase/core/iac";

/** List all rooms. */
export const listRooms = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("rooms").order("desc", "_createdAt").take(100).collect();
  },
});

/** Get messages for a room, oldest first (chat order). */
export const listMessages = query({
  args: { roomId: v.id("rooms"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    return ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("asc", "_createdAt")
      .take(limit)
      .collect();
  },
});

/** Get current presence for a room. */
export const listPresence = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("presence")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
  },
});
