import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";

const EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
const IP_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_LIMIT = 2;
const IP_LIMIT = 5;

type RateLimitScope = "email" | "ip";

async function consumeRateLimit(
  ctx: MutationCtx,
  scope: RateLimitScope,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
) {
  const existing = await ctx.db
    .query("waitlistRateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (!existing || existing.expiresAt <= now) {
    if (existing) {
      await ctx.db.patch(existing._id, {
        count: 1,
        windowStartedAt: now,
        expiresAt: now + windowMs,
      });
    } else {
      await ctx.db.insert("waitlistRateLimits", {
        key,
        scope,
        count: 1,
        windowStartedAt: now,
        expiresAt: now + windowMs,
      });
    }

    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  await ctx.db.patch(existing._id, {
    count: existing.count + 1,
  });
  return true;
}

export const getSignupForEmail = internalQuery({
  args: {
    signupId: v.id("waitlistSignups"),
  },
  handler: async (ctx, args) => {
    const signup = await ctx.db.get(args.signupId);
    if (!signup) {
      return null;
    }

    return {
      email: signup.email,
      normalizedEmail: signup.normalizedEmail,
      source: signup.source,
      emailDeliveryState: signup.emailDeliveryState,
    };
  },
});

export const recordSignup = internalMutation({
  args: {
    email: v.string(),
    normalizedEmail: v.string(),
    source: v.string(),
    ipHash: v.string(),
    userAgent: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ipAllowed = await consumeRateLimit(
      ctx,
      "ip",
      `ip:${args.ipHash}`,
      IP_LIMIT,
      IP_WINDOW_MS,
      now,
    );

    const emailAllowed = await consumeRateLimit(
      ctx,
      "email",
      `email:${args.normalizedEmail}`,
      EMAIL_LIMIT,
      EMAIL_WINDOW_MS,
      now,
    );

    if (!ipAllowed || !emailAllowed) {
      return { kind: "rate_limited" as const };
    }

    const existingSignup = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_normalizedEmail", (q) =>
        q.eq("normalizedEmail", args.normalizedEmail),
      )
      .unique();

    if (existingSignup) {
      return { kind: "duplicate" as const };
    }

    const signupId = await ctx.db.insert("waitlistSignups", {
      email: args.email,
      normalizedEmail: args.normalizedEmail,
      createdAt: now,
      source: args.source,
      ipHash: args.ipHash,
      userAgent: args.userAgent,
      lastEmailSentAt: null,
      lastEmailProviderId: null,
      lastEmailError: null,
      emailDeliveryState: "not_sent",
    });

    await ctx.scheduler.runAfter(0, internal.waitlistEmail.sendThankYouEmail, {
      signupId,
    });

    return { kind: "created" as const };
  },
});

export const markEmailDeliveryState = internalMutation({
  args: {
    signupId: v.id("waitlistSignups"),
    state: v.union(v.literal("sent"), v.literal("failed")),
    sentAt: v.union(v.number(), v.null()),
    providerId: v.union(v.string(), v.null()),
    errorMessage: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.signupId, {
      emailDeliveryState: args.state,
      lastEmailSentAt: args.sentAt,
      lastEmailProviderId: args.providerId,
      lastEmailError: args.errorMessage,
    });
      return null;
  },
});

export const cleanupExpiredRateLimits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("waitlistRateLimits")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .collect();

    for (const record of expired) {
      await ctx.db.delete(record._id);
    }

    return expired.length;
  },
});
