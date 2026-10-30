import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { consumeSignupRateLimits } from "./lib/rateLimit";

export const getSignupForEmail = internalQuery({
  args: {
    signupId: v.id("downloadSignups"),
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
        ip: `download-ip:${args.ipHash}`,
        email: `download-email:${args.normalizedEmail}`,
      },
      now,
    );

    if (!allowed) {
      return { kind: "rate_limited" as const };
    }

    const existingSignup = await ctx.db
      .query("downloadSignups")
      .withIndex("by_normalizedEmail", (q) =>
        q.eq("normalizedEmail", args.normalizedEmail),
      )
      .unique();

    if (existingSignup) {
      await ctx.scheduler.runAfter(
        0,
        internal.downloadEmail.sendThankYouEmail,
        {
          signupId: existingSignup._id,
        },
      );

      return { kind: "duplicate" as const };
    }

    const signupId = await ctx.db.insert("downloadSignups", {
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

    await ctx.scheduler.runAfter(0, internal.downloadEmail.sendThankYouEmail, {
      signupId,
    });

    return { kind: "created" as const };
  },
});

export const markEmailDeliveryState = internalMutation({
  args: {
    signupId: v.id("downloadSignups"),
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
