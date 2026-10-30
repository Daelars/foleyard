import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";

// Renewed by every batch. If an action dies mid-batch, the lease expires and
// the send can be resumed.
const LAUNCH_EMAIL_LEASE_MS = 60 * 1000;

// How many interrupted/failed rows the reset tool cleans up per transaction
// before rescheduling itself.
const RESET_CLEANUP_LIMIT = 200;

async function getConfig(ctx: MutationCtx) {
  return await ctx.db.query("launchConfig").first();
}

// A dead run can leave one recipient marked "sending": the email may or may
// not have gone out. Record it as failed instead of retrying automatically so a
// resume can never deliver a second copy; the admin can retry it deliberately.
async function recoverInterruptedAttempt(
  ctx: MutationCtx,
  config: Doc<"launchConfig">,
) {
  const inFlightId = config.launchEmailInFlightSignupId;
  if (!inFlightId) return;

  const signup = await ctx.db.get(inFlightId);
  if (!signup || signup.launchEmailState !== "sending") {
    await ctx.db.patch(config._id, { launchEmailInFlightSignupId: null });
    return;
  }

  await ctx.db.patch(signup._id, {
    launchEmailState: "failed",
    launchEmailSentAt: null,
    launchEmailError: "Interrupted before delivery was confirmed",
  });
  await ctx.db.patch(config._id, {
    launchEmailFailedCount: (config.launchEmailFailedCount ?? 0) + 1,
    launchEmailInFlightSignupId: null,
  });
}

// Atomically takes the send for one run (or continues the given run) and
// returns the cursor to resume from.
export const claimLaunchEmail = internalMutation({
  args: {
    mode: v.union(v.literal("send"), v.literal("retry")),
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const config = await getConfig(ctx);

    if (!config) {
      if (args.mode === "retry") {
        return {
          started: false,
          reason: "not_started" as const,
          resumed: false,
          cursor: null,
        };
      }

      await ctx.db.insert("launchConfig", {
        launched: false,
        launchEmailSent: true,
        launchedAt: null,
        launchEmailDone: false,
        launchEmailCursor: null,
        launchEmailSentCount: 0,
        launchEmailFailedCount: 0,
        launchEmailRunStartedAt: now,
        launchEmailFinishedAt: null,
        launchEmailLeaseUntil: now + LAUNCH_EMAIL_LEASE_MS,
        launchEmailRunId: args.runId,
        launchEmailInFlightSignupId: null,
      });

      return {
        started: true,
        reason: null,
        resumed: false,
        cursor: null,
      };
    }

    if (args.mode === "send" && config.launchEmailDone) {
      return {
        started: false,
        reason: "done" as const,
        resumed: false,
        cursor: null,
      };
    }

    if (args.mode === "retry" && !config.launchEmailSent) {
      return {
        started: false,
        reason: "not_started" as const,
        resumed: false,
        cursor: null,
      };
    }

    const leaseActive = (config.launchEmailLeaseUntil ?? 0) > now;
    if (leaseActive && config.launchEmailRunId !== args.runId) {
      return {
        started: false,
        reason: "running" as const,
        resumed: false,
        cursor: null,
      };
    }

    if (args.mode === "send" && !config.launchEmailSent) {
      await ctx.db.patch(config._id, {
        launchEmailSent: true,
        launchEmailDone: false,
        launchEmailCursor: null,
        launchEmailSentCount: 0,
        launchEmailFailedCount: 0,
        launchEmailRunStartedAt: now,
        launchEmailFinishedAt: null,
        launchEmailLeaseUntil: now + LAUNCH_EMAIL_LEASE_MS,
        launchEmailRunId: args.runId,
        launchEmailInFlightSignupId: null,
      });

      return {
        started: true,
        reason: null,
        resumed: false,
        cursor: null,
      };
    }

    if (config.launchEmailRunId !== args.runId) {
      await recoverInterruptedAttempt(ctx, config);
    }

    await ctx.db.patch(config._id, {
      launchEmailLeaseUntil: now + LAUNCH_EMAIL_LEASE_MS,
      launchEmailRunId: args.runId,
    });

    return {
      started: true,
      reason: null,
      resumed: true,
      cursor: config.launchEmailCursor ?? null,
    };
  },
});

// One page of waitlist signups that still need the launch email. Already sent
// and previously failed recipients are skipped; failures are retried only
// through the explicit retry mode.
export const getLaunchEmailBatch = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("waitlistSignups").paginate({
      numItems: args.limit,
      cursor: args.cursor,
    });

    const recipients = page.page
      .filter(
        (signup) =>
          signup.launchEmailState !== "sent" &&
          signup.launchEmailState !== "sending" &&
          signup.launchEmailState !== "failed",
      )
      .map((signup) => ({ _id: signup._id, email: signup.email }));

    return {
      recipients,
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const getFailedLaunchEmailBatch = internalQuery({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) => q.eq("launchEmailState", "failed"))
      .take(args.limit);

    return {
      recipients: rows.map((signup) => ({
        _id: signup._id,
        email: signup.email,
      })),
    };
  },
});

// Marks a recipient as in flight before the provider call so a concurrent or
// resumed run never picks the same person up again.
export const beginLaunchEmailAttempt = internalMutation({
  args: {
    signupId: v.id("waitlistSignups"),
  },
  handler: async (ctx, args) => {
    const signup = await ctx.db.get(args.signupId);
    if (!signup) {
      return { started: false as const, reason: "missing" as const };
    }

    if (
      signup.launchEmailState === "sent" ||
      signup.launchEmailState === "sending"
    ) {
      return { started: false as const, reason: "already_attempted" as const };
    }

    await ctx.db.patch(args.signupId, {
      launchEmailState: "sending",
      launchEmailSentAt: null,
      launchEmailError: null,
    });

    const config = await getConfig(ctx);
    if (config) {
      await ctx.db.patch(config._id, {
        launchEmailInFlightSignupId: args.signupId,
      });
    }

    return { started: true as const, reason: null };
  },
});

export const recordLaunchEmailResult = internalMutation({
  args: {
    signupId: v.id("waitlistSignups"),
    outcome: v.union(v.literal("sent"), v.literal("failed")),
    errorMessage: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const signup = await ctx.db.get(args.signupId);
    if (!signup) return null;

    const previous = signup.launchEmailState;
    await ctx.db.patch(args.signupId, {
      launchEmailState: args.outcome,
      launchEmailSentAt: args.outcome === "sent" ? Date.now() : null,
      launchEmailError:
        args.outcome === "failed" ? args.errorMessage : null,
    });

    const config = await getConfig(ctx);
    if (!config) return null;

    let sent = config.launchEmailSentCount ?? 0;
    let failed = config.launchEmailFailedCount ?? 0;

    if (args.outcome === "sent") {
      if (previous !== "sent") sent += 1;
      if (previous === "failed") failed = Math.max(0, failed - 1);
    } else {
      if (previous === "sent") sent = Math.max(0, sent - 1);
      if (previous !== "failed") failed += 1;
    }

    const patch: {
      launchEmailSentCount: number;
      launchEmailFailedCount: number;
      launchEmailInFlightSignupId?: null;
    } = {
      launchEmailSentCount: sent,
      launchEmailFailedCount: failed,
    };

    if (config.launchEmailInFlightSignupId === args.signupId) {
      patch.launchEmailInFlightSignupId = null;
    }

    await ctx.db.patch(config._id, patch);
    return null;
  },
});

// Stores the cursor only once a batch actually delivered something, so an
// aborted batch is retried from the same place.
export const finishLaunchEmailBatch = internalMutation({
  args: {
    runId: v.string(),
    cursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  },
  handler: async (ctx, args) => {
    const config = await getConfig(ctx);
    if (!config || config.launchEmailRunId !== args.runId) return null;

    const now = Date.now();

    if (args.isDone) {
      await ctx.db.patch(config._id, {
        launchEmailDone: true,
        launchEmailCursor: args.cursor,
        launchEmailFinishedAt: now,
        launchEmailLeaseUntil: null,
        launchEmailRunId: null,
        launchEmailInFlightSignupId: null,
      });
    } else {
      await ctx.db.patch(config._id, {
        launchEmailCursor: args.cursor,
        launchEmailLeaseUntil: now + LAUNCH_EMAIL_LEASE_MS,
      });
    }

    return null;
  },
});

// Undoes a batch that delivered nothing: its recipients go back in the queue
// and the lease is released so the admin can fix the cause and resume.
export const abortLaunchEmailBatch = internalMutation({
  args: {
    runId: v.string(),
    signupIds: v.array(v.id("waitlistSignups")),
  },
  handler: async (ctx, args) => {
    let reverted = 0;

    for (const signupId of args.signupIds) {
      const signup = await ctx.db.get(signupId);
      if (!signup || signup.launchEmailState !== "failed") continue;

      await ctx.db.patch(signupId, {
        launchEmailState: "pending",
        launchEmailSentAt: null,
        launchEmailError: null,
      });
      reverted += 1;
    }

    const config = await getConfig(ctx);
    if (!config) return { reverted };

    const patch: {
      launchEmailFailedCount: number;
      launchEmailInFlightSignupId?: null;
      launchEmailLeaseUntil?: null;
      launchEmailRunId?: null;
    } = {
      launchEmailFailedCount: Math.max(
        0,
        (config.launchEmailFailedCount ?? 0) - reverted,
      ),
    };

    const ownsRun = config.launchEmailRunId === args.runId;
    if (ownsRun) {
      patch.launchEmailLeaseUntil = null;
      patch.launchEmailRunId = null;
      patch.launchEmailInFlightSignupId = null;
    } else if (
      config.launchEmailInFlightSignupId &&
      args.signupIds.includes(config.launchEmailInFlightSignupId)
    ) {
      patch.launchEmailInFlightSignupId = null;
    }

    await ctx.db.patch(config._id, patch);

    return { reverted };
  },
});

export const releaseLaunchEmailLease = internalMutation({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await getConfig(ctx);
    if (!config || config.launchEmailRunId !== args.runId) return null;

    await ctx.db.patch(config._id, {
      launchEmailLeaseUntil: null,
      launchEmailRunId: null,
    });
    return null;
  },
});

// Puts interrupted and failed recipients back in the queue so a fresh send
// starts cleanly. Only used by the reset tool when nothing has been sent.
export const clearLaunchEmailAttempts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) => q.eq("launchEmailState", "failed"))
      .take(RESET_CLEANUP_LIMIT);

    const sending = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) =>
        q.eq("launchEmailState", "sending"),
      )
      .take(RESET_CLEANUP_LIMIT);

    for (const row of [...rows, ...sending]) {
      await ctx.db.patch(row._id, {
        launchEmailState: "pending",
        launchEmailSentAt: null,
        launchEmailError: null,
      });
    }

    const cleared = rows.length + sending.length;
    if (
      rows.length === RESET_CLEANUP_LIMIT ||
      sending.length === RESET_CLEANUP_LIMIT
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.launchHelpers.clearLaunchEmailAttempts,
        {},
      );
    }

    return { cleared };
  },
});
