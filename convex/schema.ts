import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  waitlistSignups: defineTable({
    email: v.string(),
    normalizedEmail: v.string(),
    createdAt: v.number(),
    source: v.string(),
    ipHash: v.string(),
    userAgent: v.string(),
    lastEmailSentAt: v.union(v.number(), v.null()),
    lastEmailProviderId: v.optional(v.union(v.string(), v.null())),
    lastEmailError: v.optional(v.union(v.string(), v.null())),
    emailDeliveryState: v.union(
      v.literal("not_sent"),
      v.literal("sent"),
      v.literal("failed"),
    ),
  }).index("by_normalizedEmail", ["normalizedEmail"]),
  waitlistRateLimits: defineTable({
    key: v.string(),
    scope: v.union(v.literal("ip"), v.literal("email")),
    count: v.number(),
    windowStartedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),
});
