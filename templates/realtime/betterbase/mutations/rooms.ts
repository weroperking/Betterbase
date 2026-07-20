import { mutation, v } from "@betterbase/core/iac";

/** Create a room. */
export const createRoom = mutation({
  args: { name: v.string(), createdBy: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return ctx.db.insert("rooms", args);
  },
});

/**
 * Send a message. The ctx.db.insert automatically emits a table-change
 * event for "messages", which pushes to subscribed clients in realtime.
 */
export const sendMessage = mutation({
  args: {
    roomId: v.id("rooms"),
    authorId: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("messages", args);
  },
});

/** Update presence for a user in a room (upsert via patch). */
export const updatePresence = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_room_user", (q) =>
        q.eq("roomId", args.roomId).eq("userId", args.userId),
      )
      .first();

    if (existing) {
      await ctx.db.patch("presence", existing._id, {
        status: args.status,
        lastSeen: new Date().toISOString() as unknown as Date,
      });
      return existing._id;
    }
    return ctx.db.insert("presence", {
      roomId: args.roomId,
      userId: args.userId,
      status: args.status,
      lastSeen: new Date().toISOString() as unknown as Date,
    });
  },
});
