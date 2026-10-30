import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { consumeSignupRateLimits } from "./lib/rateLimit";

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
    const allowed = await consumeSignupRateLimits(
      ctx,
      {
        ip: `ip:${args.ipHash}`,
        email: `email:${args.normalizedEmail}`,
      },
      now,
    );

    if (!allowed) {
      return { kind: "rate_limited" as const };
    }

    const existingSignup = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_normalizedEmail", (q) =>
        q.eq("normalizedEmail", args.normalizedEmail),
      )
      .unique();

    if (existingSignup) {
      await ctx.scheduler.runAfter(0, internal.waitlistEmail.sendThankYouEmail, {
        signupId: existingSignup._id,
      });

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
      .take(1000);

    for (const record of expired) {
      await ctx.db.delete(record._id);
    }

    return expired.length;
  },
});
