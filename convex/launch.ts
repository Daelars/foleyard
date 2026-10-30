import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { query, mutation } from "./_generated/server";
import { assertAdmin } from "./lib/admin";
import {
  isLegacyLaunchEmailSent,
  readLaunchEmailProgress,
} from "./lib/launchEmail";

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

// Progress of the batched launch email for the admin panel. Reads the
// high-churn progress table so the visitor-facing `launch.get` document never
// changes while a send is running.
export const getLaunchEmailStatus = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);

    const config = await ctx.db.query("launchConfig").first();
    const progress = await ctx.db.query("launchEmailProgress").first();

    // A deployment that sent the launch email before the batched send existed
    // has no per-recipient record. It is finished: never offer a resume.
    const legacy = config ? isLegacyLaunchEmailSent(config) : false;
    const ledger = readLaunchEmailProgress(config, progress);

    // Bounded: the panel only needs to know that some recipients may or may
    // not have received the mail.
    const unconfirmed = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) =>
        q.eq("launchEmailState", "unconfirmed"),
      )
      .take(100);

    return {
      claimed: config?.launchEmailSent ?? false,
      done: legacy ? true : ledger.done,
      legacy,
      sent: ledger.sent,
      failed: ledger.failed,
      unconfirmed: unconfirmed.length,
      running: !legacy && (ledger.leaseUntil ?? 0) > Date.now(),
      startedAt: ledger.startedAt,
      finishedAt: ledger.finishedAt,
    };
  },
});

// Releases a claim that never delivered anything. Failed recipients go back in
// the queue; recipients interrupted mid-attempt become unconfirmed, never
// re-sendable, so a reset can never email someone a second time.
export const resetLaunchEmailClaim = mutation({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);

    const config = await ctx.db.query("launchConfig").first();
    if (!config || !config.launchEmailSent) {
      return { reset: false };
    }

    if (isLegacyLaunchEmailSent(config)) {
      throw new ConvexError(
        "This deployment already sent the launch email before batched sending existed, so the claim cannot be reset.",
      );
    }

    const progress = await ctx.db.query("launchEmailProgress").first();
    const ledger = readLaunchEmailProgress(config, progress);

    if ((ledger.leaseUntil ?? 0) > Date.now()) {
      throw new ConvexError(
        "A launch email batch is currently running. Wait for it to stop and try again.",
      );
    }

    if (ledger.sent > 0) {
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

    if (progress) {
      await ctx.db.patch(progress._id, {
        done: false,
        cursor: null,
        sent: 0,
        failed: 0,
        runStartedAt: null,
        finishedAt: null,
        leaseUntil: null,
        runId: null,
        inFlightSignupId: null,
      });
    }

    return { reset: true };
  },
});
