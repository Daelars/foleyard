import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { query, mutation } from "./_generated/server";
import { assertAdmin } from "./lib/admin";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("launchConfig").first();
    if (!config) {
      return { launched: false, launchEmailSent: false, launchedAt: null };
    }
    return {
      launched: config.launched,
      launchEmailSent: config.launchEmailSent,
      launchedAt: config.launchedAt,
    };
  },
});

export const setLaunched = mutation({
  args: { launched: v.boolean() },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);

    const existing = await ctx.db.query("launchConfig").first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        launched: args.launched,
        launchedAt: args.launched ? Date.now() : null,
      });
    } else {
      await ctx.db.insert("launchConfig", {
        launched: args.launched,
        launchEmailSent: false,
        launchedAt: args.launched ? Date.now() : null,
      });
    }
  },
});

// Progress of the batched launch email for the admin panel.
export const getLaunchEmailStatus = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);

    const config = await ctx.db.query("launchConfig").first();
    if (!config) {
      return {
        claimed: false,
        done: false,
        sent: 0,
        failed: 0,
        running: false,
        startedAt: null,
        finishedAt: null,
      };
    }

    return {
      claimed: config.launchEmailSent,
      done: config.launchEmailDone ?? false,
      sent: config.launchEmailSentCount ?? 0,
      failed: config.launchEmailFailedCount ?? 0,
      running: (config.launchEmailLeaseUntil ?? 0) > Date.now(),
      startedAt: config.launchEmailRunStartedAt ?? null,
      finishedAt: config.launchEmailFinishedAt ?? null,
    };
  },
});

// Releases a claim that never delivered anything. Recipients left mid-send or
// failed go back in the queue so a fresh send starts from the beginning.
export const resetLaunchEmailClaim = mutation({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);

    const config = await ctx.db.query("launchConfig").first();
    if (!config || !config.launchEmailSent) {
      return { reset: false };
    }

    if ((config.launchEmailLeaseUntil ?? 0) > Date.now()) {
      throw new ConvexError(
        "A launch email batch is currently running. Wait for it to stop and try again.",
      );
    }

    if ((config.launchEmailSentCount ?? 0) > 0) {
      throw new ConvexError(
        "Launch email has already reached at least one recipient, so the claim cannot be reset.",
      );
    }

    await ctx.runMutation(
      internal.launchHelpers.clearLaunchEmailAttempts,
      {},
    );

    await ctx.db.patch(config._id, {
      launchEmailSent: false,
      launchEmailDone: false,
      launchEmailCursor: null,
      launchEmailSentCount: 0,
      launchEmailFailedCount: 0,
      launchEmailRunStartedAt: null,
      launchEmailFinishedAt: null,
      launchEmailLeaseUntil: null,
      launchEmailRunId: null,
      launchEmailInFlightSignupId: null,
    });

    return { reset: true };
  },
});
