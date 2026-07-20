import { defineSchema, defineTable, v } from "@betterbase/core/iac";

/**
 * Realtime schema: chat rooms, messages, and presence.
 * Writes via ctx.db automatically emit table-change events that drive
 * realtime subscriptions on the client. See README for client usage.
 */
export default defineSchema({
  rooms: defineTable({
    name: v.string(),
    createdBy: v.optional(v.string()),
  }).index("by_name", ["name"]),

  messages: defineTable({
    roomId: v.id("rooms"),
    authorId: v.optional(v.string()),
    body: v.string(),
  })
    .index("by_room", ["roomId", "_createdAt"])
    .index("by_room_created", ["roomId", "_createdAt"]),

  presence: defineTable({
    roomId: v.id("rooms"),
    userId: v.string(),
    lastSeen: v.datetime(),
    status: v.string(),
  })
    .index("by_room", ["roomId"])
    .uniqueIndex("by_room_user", ["roomId", "userId"]),
});
