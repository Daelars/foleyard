import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import {
  isLegacyLaunchEmailSent,
  LAUNCH_EMAIL_LEASE_MS,
  readLaunchEmailProgress,
} from "./lib/launchEmail";

// How many interrupted/failed rows the reset tool cleans up per transaction
// before rescheduling itself.
const RESET_CLEANUP_LIMIT = 200;

// At the end of a batch nothing is in flight any more, so any row still marked
// "sending" is an attempt whose result was never recorded: mark it
// unconfirmed rather than leaving it invisible or retryable.
const UNCONFIRMED_SWEEP_LIMIT = 50;

async function markLeftoverSendingUnconfirmed(ctx: MutationCtx) {
  const rows = await ctx.db
    .query("waitlistSignups")
    .withIndex("by_launchEmailState", (q) => q.eq("launchEmailState", "sending"))
    .take(UNCONFIRMED_SWEEP_LIMIT);

  for (const row of rows) {
    await ctx.db.patch(row._id, {
      launchEmailState: "unconfirmed",
      launchEmailSentAt: null,
      launchEmailError: "Delivery was not confirmed",
    });
  }
}

async function getConfig(ctx: MutationCtx) {
  return await ctx.db.query("launchConfig").first();
}

async function getProgress(ctx: MutationCtx) {
  return await ctx.db.query("launchEmailProgress").first();
}

function notStarted(reason: "done" | "running" | "not_started") {
  return {
    started: false as const,
    reason,
    resumed: false,
    cursor: null,
  };
}

// Creates the progress row, carrying over an in-flight run started by the
// previous batched implementation so it can still be resumed.
async function ensureProgress(
  ctx: MutationCtx,
  config: Doc<"launchConfig">,
): Promise<Doc<"launchEmailProgress">> {
  const existing = await getProgress(ctx);
  if (existing) return existing;

  const migrated = readLaunchEmailProgress(config, null);
  const id = await ctx.db.insert("launchEmailProgress", {
    done: migrated.done,
    cursor: migrated.cursor,
    sent: migrated.sent,
    failed: migrated.failed,
    runStartedAt: migrated.startedAt,
    finishedAt: migrated.finishedAt,
    leaseUntil: migrated.leaseUntil,
    runId: migrated.runId,
    inFlightSignupId: migrated.inFlightSignupId,
  });

  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create launch email progress");
  return created;
}

// A dead run can leave one recipient marked "sending": the email may or may
// not have gone out. Record it as unconfirmed instead of failed, so no
// automatic retry can deliver a second copy; the admin sees it in the panel.
async function recoverInterruptedAttempt(
  ctx: MutationCtx,
  progress: Doc<"launchEmailProgress">,
) {
  const inFlightId = progress.inFlightSignupId;
  if (!inFlightId) return;

  const signup = await ctx.db.get(inFlightId);
  if (!signup || signup.launchEmailState !== "sending") {
    await ctx.db.patch(progress._id, { inFlightSignupId: null });
    return;
  }

  await ctx.db.patch(signup._id, {
    launchEmailState: "unconfirmed",
    launchEmailSentAt: null,
    launchEmailError: "Interrupted before delivery was confirmed",
  });
  await ctx.db.patch(progress._id, { inFlightSignupId: null });
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

    // Sent by the old one-shot code: there is no per-recipient record, so the
    // only safe answer is "already done", for a send, a resume and a retry.
    if (config && isLegacyLaunchEmailSent(config)) {
      return notStarted("done");
    }

    if (!config) {
      if (args.mode === "retry") {
        return notStarted("not_started");
      }

      await ctx.db.insert("launchConfig", {
        launched: false,
        launchEmailSent: true,
        launchedAt: null,
        launchEmailDone: false,
      });
      await ctx.db.insert("launchEmailProgress", {
        done: false,
        cursor: null,
        sent: 0,
        failed: 0,
        runStartedAt: now,
        finishedAt: null,
        leaseUntil: now + LAUNCH_EMAIL_LEASE_MS,
        runId: args.runId,
        inFlightSignupId: null,
      });

      return { started: true, reason: null, resumed: false, cursor: null };
    }

    const progress = await ensureProgress(ctx, config);

    if (args.mode === "send" && progress.done) {
      return notStarted("done");
    }

    if (args.mode === "retry" && !config.launchEmailSent) {
      return notStarted("not_started");
    }

    const leaseActive = (progress.leaseUntil ?? 0) > now;
    if (leaseActive && progress.runId !== args.runId) {
      return notStarted("running");
    }

    if (args.mode === "send" && !config.launchEmailSent) {
      await ctx.db.patch(config._id, {
        launchEmailSent: true,
        launchEmailDone: false,
      });
      await ctx.db.patch(progress._id, {
        done: false,
        cursor: null,
        sent: 0,
        failed: 0,
        runStartedAt: now,
        finishedAt: null,
        leaseUntil: now + LAUNCH_EMAIL_LEASE_MS,
        runId: args.runId,
        inFlightSignupId: null,
      });

      return { started: true, reason: null, resumed: false, cursor: null };
    }

    if (progress.runId !== args.runId) {
      await recoverInterruptedAttempt(ctx, progress);
    }

    await ctx.db.patch(progress._id, {
      leaseUntil: now + LAUNCH_EMAIL_LEASE_MS,
      runId: args.runId,
    });

    return {
      started: true,
      reason: null,
      resumed: true,
      cursor: progress.cursor ?? null,
    };
  },
});

// One page of waitlist signups that still need the launch email. Already sent,
// in-flight, failed and unconfirmed recipients are skipped; failures are
// retried only through the explicit retry mode.
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
          signup.launchEmailState !== "failed" &&
          signup.launchEmailState !== "unconfirmed",
      )
      .map((signup) => ({ _id: signup._id, email: signup.email }));

    return {
      recipients,
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

// Unconfirmed attempts are deliberately excluded: a retry could deliver a
// second copy if the provider no longer remembers the idempotency key.
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
// resumed run never picks the same person up again, and renews the lease so a
// slow batch cannot lose it.
export const beginLaunchEmailAttempt = internalMutation({
  args: {
    signupId: v.id("waitlistSignups"),
    runId: v.string(),
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

    const progress = await getProgress(ctx);
    if (!progress || progress.runId !== args.runId) {
      return { started: false as const, reason: "stale_run" as const };
    }

    // A retry stops counting as failed the moment it is attempted again.
    const wasFailed = signup.launchEmailState === "failed";

    await ctx.db.patch(args.signupId, {
      launchEmailState: "sending",
      launchEmailSentAt: null,
      launchEmailError: null,
    });

    await ctx.db.patch(progress._id, {
      inFlightSignupId: args.signupId,
      leaseUntil: Date.now() + LAUNCH_EMAIL_LEASE_MS,
      ...(wasFailed ? { failed: Math.max(0, progress.failed - 1) } : {}),
    });

    return { started: true as const, reason: null };
  },
});

// Settles an in-flight attempt. Reports for a recipient that is no longer
// "sending" are ignored, so a late or repeated report can never flip an
// already delivered email to failed or count it twice.
export const recordLaunchEmailResult = internalMutation({
  args: {
    signupId: v.id("waitlistSignups"),
    outcome: v.union(v.literal("sent"), v.literal("failed")),
    errorMessage: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const signup = await ctx.db.get(args.signupId);
    if (!signup || signup.launchEmailState !== "sending") return null;

    await ctx.db.patch(args.signupId, {
      launchEmailState: args.outcome,
      launchEmailSentAt: args.outcome === "sent" ? Date.now() : null,
      launchEmailError: args.outcome === "failed" ? args.errorMessage : null,
    });

    const progress = await getProgress(ctx);
    if (!progress) return null;

    await ctx.db.patch(progress._id, {
      sent: args.outcome === "sent" ? progress.sent + 1 : progress.sent,
      failed: args.outcome === "failed" ? progress.failed + 1 : progress.failed,
      ...(progress.inFlightSignupId === args.signupId
        ? { inFlightSignupId: null }
        : {}),
    });

    return null;
  },
});

// Stores the cursor once a batch has been processed. Per-recipient failures are
// already recorded on their signup rows, so the cursor advances past them and
// the run can finish; retrying them is a separate, explicit action.
export const finishLaunchEmailBatch = internalMutation({
  args: {
    runId: v.string(),
    cursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  },
  handler: async (ctx, args) => {
    const progress = await getProgress(ctx);
    if (!progress || progress.runId !== args.runId) return null;

    const now = Date.now();
    await markLeftoverSendingUnconfirmed(ctx);

    if (args.isDone) {
      await ctx.db.patch(progress._id, {
        done: true,
        cursor: args.cursor,
        finishedAt: now,
        leaseUntil: null,
        runId: null,
        inFlightSignupId: null,
      });
    } else {
      await ctx.db.patch(progress._id, {
        cursor: args.cursor,
        leaseUntil: now + LAUNCH_EMAIL_LEASE_MS,
      });
    }

    return null;
  },
});

// Undoes a batch that hit a provider-wide error: its recipients go back in the
// queue and the lease is released so the admin can fix the cause and resume.
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

    const progress = await getProgress(ctx);
    if (!progress) return { reverted };

    const patch: {
      failed: number;
      inFlightSignupId?: null;
      leaseUntil?: null;
      runId?: null;
    } = {
      failed: Math.max(0, progress.failed - reverted),
    };

    const ownsRun = progress.runId === args.runId;
    if (ownsRun) {
      await markLeftoverSendingUnconfirmed(ctx);
      patch.leaseUntil = null;
      patch.runId = null;
      patch.inFlightSignupId = null;
    } else if (
      progress.inFlightSignupId &&
      args.signupIds.includes(progress.inFlightSignupId)
    ) {
      patch.inFlightSignupId = null;
    }

    await ctx.db.patch(progress._id, patch);

    return { reverted };
  },
});

export const releaseLaunchEmailLease = internalMutation({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const progress = await getProgress(ctx);
    if (!progress || progress.runId !== args.runId) return null;

    await ctx.db.patch(progress._id, {
      leaseUntil: null,
      runId: null,
    });
    return null;
  },
});

// Puts failed recipients back in the queue and marks interrupted ones as
// unconfirmed, never back to a re-sendable state. Only used by the reset tool
// when nothing has been sent.
export const clearLaunchEmailAttempts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const failed = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) => q.eq("launchEmailState", "failed"))
      .take(RESET_CLEANUP_LIMIT);

    const sending = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) =>
        q.eq("launchEmailState", "sending"),
      )
      .take(RESET_CLEANUP_LIMIT);

    for (const row of failed) {
      await ctx.db.patch(row._id, {
        launchEmailState: "pending",
        launchEmailSentAt: null,
        launchEmailError: null,
      });
    }

    for (const row of sending) {
      await ctx.db.patch(row._id, {
        launchEmailState: "unconfirmed",
        launchEmailSentAt: null,
        launchEmailError: "Interrupted before delivery was confirmed",
      });
    }

    const cleared = failed.length + sending.length;
    if (
      failed.length === RESET_CLEANUP_LIMIT ||
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
