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
    // Progress for the one-off launch announcement. Missing means the signup
    // has not been attempted yet; the other states make batched sends
    // resumable without emailing the same person twice.
    // "unconfirmed" is an attempt that may or may not have reached the
    // recipient (the send was interrupted before delivery was recorded). It is
    // never picked up by an automatic send or retry; the admin has to look at
    // it deliberately.
    launchEmailState: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("sending"),
        v.literal("sent"),
        v.literal("failed"),
        v.literal("unconfirmed"),
        // The recipient opted out. Terminal: no send, resume, retry or requeue
        // path ever selects it again.
        v.literal("unsubscribed"),
      ),
    ),
    launchEmailSentAt: v.optional(v.union(v.number(), v.null())),
    // The provider's message id for a recorded delivery, kept so a row can be
    // reconciled with the provider's log (and so an ambiguous row that does
    // have an id is traceable).
    launchEmailProviderId: v.optional(v.union(v.string(), v.null())),
    launchEmailError: v.optional(v.union(v.string(), v.null())),
    // How many times this recipient has been attempted. Retries skip rows that
    // reached the maximum, so permanently failing recipients at the front of
    // the queue cannot starve the rest.
    launchEmailAttempts: v.optional(v.number()),
    // Per-recipient lease of an in-flight attempt. A "sending" row whose lease
    // has expired is an attempt whose result was never recorded, and the status
    // query counts it as unconfirmed.
    launchEmailLeaseUntil: v.optional(v.union(v.number(), v.null())),
    // The run that put this row in flight. A batch end can only settle rows it
    // owns, so a late or stale run can never hide a newer run's in-flight row.
    launchEmailRunId: v.optional(v.union(v.string(), v.null())),
    // When this recipient asked to stop receiving email. Additive and optional:
    // rows written before opt-out existed simply do not have it. Every send,
    // resume, retry and requeue path skips a row that has it, and signing up
    // again never clears it.
    unsubscribedAt: v.optional(v.number()),
  })
    .index("by_normalizedEmail", ["normalizedEmail"])
    .index("by_launchEmailState", ["launchEmailState"])
    // Lets a retry reach every retryable failed row without walking past the
    // ones that used up their attempts.
    .index("by_launchEmailState_and_launchEmailAttempts", [
      "launchEmailState",
      "launchEmailAttempts",
    ]),
  waitlistRateLimits: defineTable({
    key: v.string(),
    scope: v.union(v.literal("ip"), v.literal("email")),
    count: v.number(),
    windowStartedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),
  blogPosts: defineTable({
    title: v.string(),
    slug: v.string(),
    content: v.string(),
    excerpt: v.string(),
    tags: v.array(v.string()),
    coverImage: v.union(v.string(), v.null()),
    publishedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_publishedAt", ["publishedAt"]),
  sitePages: defineTable({
    slug: v.string(),
    title: v.string(),
    content: v.string(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),
  launchConfig: defineTable({
    launched: v.boolean(),
    launchEmailSent: v.boolean(),
    launchedAt: v.union(v.number(), v.null()),
    // Legacy progress fields from the first batched implementation. The send
    // now keeps its high-churn progress in `launchEmailProgress` so visitors
    // subscribing to `launch.get` are not re-run while it works. These stay in
    // the schema because existing documents still carry them and one older run
    // may be migrated from them.
    launchEmailDone: v.optional(v.boolean()),
    launchEmailCursor: v.optional(v.union(v.string(), v.null())),
    launchEmailSentCount: v.optional(v.number()),
    launchEmailFailedCount: v.optional(v.number()),
    launchEmailRunStartedAt: v.optional(v.union(v.number(), v.null())),
    launchEmailFinishedAt: v.optional(v.union(v.number(), v.null())),
    launchEmailLeaseUntil: v.optional(v.union(v.number(), v.null())),
    launchEmailRunId: v.optional(v.union(v.string(), v.null())),
    launchEmailInFlightSignupId: v.optional(
      v.union(v.id("waitlistSignups"), v.null()),
    ),
  }),
  // High-churn progress of the batched launch email. Kept out of
  // `launchConfig` because every visitor subscribes to that document through
  // `launch.get`, and it must not change while a send is running.
  launchEmailProgress: defineTable({
    done: v.boolean(),
    cursor: v.optional(v.union(v.string(), v.null())),
    sent: v.number(),
    failed: v.number(),
    runStartedAt: v.optional(v.union(v.number(), v.null())),
    finishedAt: v.optional(v.union(v.number(), v.null())),
    leaseUntil: v.optional(v.union(v.number(), v.null())),
    runId: v.optional(v.union(v.string(), v.null())),
    inFlightSignupId: v.optional(
      v.union(v.id("waitlistSignups"), v.null()),
    ),
    // Why the last batch stopped early (a provider-wide error, or too many
    // consecutive failures). Set when a batch aborts, cleared when a fresh run
    // claims the send, so the panel can say "paused: retry later" instead of
    // reporting the run as finished.
    lastError: v.optional(v.union(v.string(), v.null())),
    // Exact denominators for the panel. `failed` counts every failed row;
    // `exhaustedFailed` is the subset that used up its attempts and is not
    // offered for a retry, so retryable = failed - exhaustedFailed without
    // sampling. `unconfirmed` counts rows that may have been delivered.
    // `unsubscribed` counts recipients that opted out; they are skipped by
    // every send and are not part of the other totals' denominators.
    exhaustedFailed: v.optional(v.number()),
    unconfirmed: v.optional(v.number()),
    unsubscribed: v.optional(v.number()),
  }),
  downloads: defineTable({
    timestamp: v.number(),
  }).index("by_timestamp", ["timestamp"]),
  downloadSignups: defineTable({
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
    // When this recipient asked to stop receiving email. Optional and additive,
    // so existing rows stay valid. A repeat signup never clears it.
    unsubscribedAt: v.optional(v.number()),
  }).index("by_normalizedEmail", ["normalizedEmail"]),
  teamMembers: defineTable({
    name: v.string(),
    role: v.string(),
    bio: v.string(),
    imageUrl: v.union(v.string(), v.null()),
    order: v.number(),
  }).index("by_order", ["order"]),
});
