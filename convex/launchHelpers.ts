import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import {
  isLegacyLaunchEmailSent,
  LAUNCH_EMAIL_LEASE_MS,
  LAUNCH_EMAIL_MAX_ATTEMPTS,
  readLaunchEmailProgress,
} from "./lib/launchEmail";

// How many rows one cleanup/requeue invocation processes before rescheduling
// itself.
const RESET_CLEANUP_LIMIT = 200;
const REQUEUE_LIMIT = 200;

// How many "sending" rows a batch end looks at. Only rows owned by the run
// that just ended are settled, so a stale batch cannot touch a live attempt.
const LEFTOVER_SWEEP_LIMIT = 200;

// Failed rows written before per-recipient attempts existed are not in the
// state+attempts index; scan this many state-index rows to find them.
const LEGACY_FAILED_SCAN_LIMIT = 200;

// At the end of a batch nothing it owned is in flight any more, so any row it
// left "sending" is an attempt whose result was never recorded: mark it
// unconfirmed rather than leaving it invisible or retryable.
async function sweepLeftoverSending(ctx: MutationCtx, runId: string) {
  const rows = await ctx.db
    .query("waitlistSignups")
    .withIndex("by_launchEmailState", (q) => q.eq("launchEmailState", "sending"))
    .take(LEFTOVER_SWEEP_LIMIT);

  const now = Date.now();
  let swept = 0;
  for (const row of rows) {
    // Another run owns this row and its lease is still live: its action may
    // still be working on it. A row this run set, or one whose per-attempt
    // lease has expired, lost its result and cannot stay invisible.
    if (
      row.launchEmailRunId !== runId &&
      (row.launchEmailLeaseUntil ?? 0) > now
    ) {
      continue;
    }

    await ctx.db.patch(row._id, {
      launchEmailState: "unconfirmed",
      launchEmailSentAt: null,
      launchEmailError: "Delivery was not confirmed",
      launchEmailLeaseUntil: null,
      launchEmailRunId: null,
    });
    swept += 1;
  }

  return swept;
}

async function getConfig(ctx: MutationCtx) {
  return await ctx.db.query("launchConfig").first();
}

async function getProgress(ctx: MutationCtx) {
  return await ctx.db.query("launchEmailProgress").first();
}

type ProgressDoc = Doc<"launchEmailProgress">;

// Exact denominators are maintained going forward. A progress document written
// before they existed is rebuilt once, by reading the two state indexes, so the
// panel never has to sample a capped page.
async function backfillProgressCounters(
  ctx: MutationCtx,
  progress: ProgressDoc,
): Promise<ProgressDoc> {
  if (
    progress.exhaustedFailed !== undefined &&
    progress.unconfirmed !== undefined
  ) {
    return progress;
  }

  let exhaustedFailed = 0;
  for await (const row of ctx.db
    .query("waitlistSignups")
    .withIndex("by_launchEmailState", (q) =>
      q.eq("launchEmailState", "failed"),
    )) {
    if ((row.launchEmailAttempts ?? 0) >= LAUNCH_EMAIL_MAX_ATTEMPTS) {
      exhaustedFailed += 1;
    }
  }

  let unconfirmed = 0;
  for await (const row of ctx.db
    .query("waitlistSignups")
    .withIndex("by_launchEmailState", (q) =>
      q.eq("launchEmailState", "unconfirmed"),
    )) {
    unconfirmed += 1;
  }

  await ctx.db.patch(progress._id, { exhaustedFailed, unconfirmed });
  return { ...progress, exhaustedFailed, unconfirmed };
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
): Promise<ProgressDoc> {
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
    lastError: migrated.lastError,
    exhaustedFailed: 0,
    unconfirmed: 0,
  });

  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create launch email progress");
  return created;
}

// A dead run can leave one recipient marked "sending": the email may or may
// not have gone out. Record it as unconfirmed instead of failed, so no
// automatic retry can deliver a second copy; the admin sees it in the panel.
// Returns how many rows it changed so the caller can update the counter.
async function recoverInterruptedAttempt(
  ctx: MutationCtx,
  progress: ProgressDoc,
) {
  const inFlightId = progress.inFlightSignupId;
  if (!inFlightId) return 0;

  const signup = await ctx.db.get(inFlightId);
  if (!signup || signup.launchEmailState !== "sending") {
    await ctx.db.patch(progress._id, { inFlightSignupId: null });
    return 0;
  }

  await ctx.db.patch(signup._id, {
    launchEmailState: "unconfirmed",
    launchEmailSentAt: null,
    launchEmailError: "Interrupted before delivery was confirmed",
    launchEmailLeaseUntil: null,
    launchEmailRunId: null,
  });
  await ctx.db.patch(progress._id, { inFlightSignupId: null });
  return 1;
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
        exhaustedFailed: 0,
        unconfirmed: 0,
      });

      return { started: true, reason: null, resumed: false, cursor: null };
    }

    let progress = await ensureProgress(ctx, config);
    progress = await backfillProgressCounters(ctx, progress);

    // A finished send can be started again only to deliver recipients the
    // admin deliberately requeued from `unconfirmed` (they are `pending`).
    // Everyone sent, failed or unconfirmed is still skipped by the scan, so
    // this cannot re-send to anyone who already received the mail.
    let restartForRequeued = false;
    if (args.mode === "send" && progress.done) {
      const pending = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_launchEmailState", (q) =>
          q.eq("launchEmailState", "pending"),
        )
        .take(1);
      if (pending.length === 0) {
        return notStarted("done");
      }
      restartForRequeued = true;
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
        lastError: null,
      });

      return { started: true, reason: null, resumed: false, cursor: null };
    }

    let recovered = 0;
    if (!restartForRequeued && progress.runId !== args.runId) {
      recovered = await recoverInterruptedAttempt(ctx, progress);
    }

    // A new attempt clears the previous pause reason; a batch that aborts sets
    // it again.
    await ctx.db.patch(progress._id, {
      leaseUntil: now + LAUNCH_EMAIL_LEASE_MS,
      runId: args.runId,
      lastError: null,
      ...(recovered > 0
        ? { unconfirmed: (progress.unconfirmed ?? 0) + recovered }
        : {}),
      ...(restartForRequeued
        ? {
            done: false,
            cursor: null,
            finishedAt: null,
            runStartedAt: now,
          }
        : {}),
    });

    return {
      started: true,
      reason: null,
      resumed: true,
      cursor: restartForRequeued ? null : (progress.cursor ?? null),
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
          signup.launchEmailState !== "unconfirmed" &&
          // A recipient that failed too many times is left to the admin; it
          // must not block the rest of the list.
          (signup.launchEmailAttempts ?? 0) < LAUNCH_EMAIL_MAX_ATTEMPTS,
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
//
// The state+attempts index answers the retry range directly, so rows that used
// up their attempts are skipped by the index instead of being scanned past: a
// list of any size of exhausted rows can never hide a retryable one.
export const getFailedLaunchEmailBatch = internalQuery({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const recipients: Array<{ _id: Id<"waitlistSignups">; email: string }> = [];

    const retryable = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState_and_launchEmailAttempts", (q) =>
        q
          .eq("launchEmailState", "failed")
          .lt("launchEmailAttempts", LAUNCH_EMAIL_MAX_ATTEMPTS),
      )
      .take(args.limit);

    for (const signup of retryable) {
      recipients.push({ _id: signup._id, email: signup.email });
    }

    // Rows failed before attempts were recorded are not in that index. They
    // are retryable (zero attempts) and are the oldest rows, so a small scan
    // of the state index is enough to keep them reachable.
    if (recipients.length < args.limit) {
      let scanned = 0;
      for await (const signup of ctx.db
        .query("waitlistSignups")
        .withIndex("by_launchEmailState", (q) =>
          q.eq("launchEmailState", "failed"),
        )) {
        if (recipients.length >= args.limit) break;
        if (scanned >= LEGACY_FAILED_SCAN_LIMIT) break;
        scanned += 1;
        if (signup.launchEmailAttempts !== undefined) continue;
        recipients.push({ _id: signup._id, email: signup.email });
      }
    }

    return { recipients };
  },
});

// Marks a recipient as in flight before the provider call so a concurrent or
// resumed run never picks the same person up again, and renews the lease so a
// slow batch cannot lose it.
//
// Only an unattempted, pending or failed recipient may start. `sent` is final,
// `sending` is owned by another attempt, and `unconfirmed` is never retried
// automatically because the mail may already have gone out; the admin moves an
// unconfirmed row back to `pending` deliberately first.
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

    const state = signup.launchEmailState;
    if (
      state !== undefined &&
      state !== "pending" &&
      state !== "failed"
    ) {
      return { started: false as const, reason: "already_attempted" as const };
    }

    const attempts = signup.launchEmailAttempts ?? 0;
    if (attempts >= LAUNCH_EMAIL_MAX_ATTEMPTS) {
      return { started: false as const, reason: "exhausted" as const };
    }

    const progress = await getProgress(ctx);
    if (!progress || progress.runId !== args.runId) {
      return { started: false as const, reason: "stale_run" as const };
    }

    // A retry stops counting as failed the moment it is attempted again.
    const wasFailed = state === "failed";

    await ctx.db.patch(args.signupId, {
      launchEmailState: "sending",
      launchEmailSentAt: null,
      launchEmailError: null,
      launchEmailAttempts: attempts + 1,
      launchEmailLeaseUntil: Date.now() + LAUNCH_EMAIL_LEASE_MS,
      launchEmailRunId: args.runId,
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
    // "unconfirmed" is an attempt that may have reached the provider. It is
    // counted separately and never retried automatically.
    outcome: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("unconfirmed"),
    ),
    errorMessage: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const signup = await ctx.db.get(args.signupId);
    if (!signup || signup.launchEmailState !== "sending") return null;

    await ctx.db.patch(args.signupId, {
      launchEmailState: args.outcome,
      launchEmailSentAt: args.outcome === "sent" ? Date.now() : null,
      launchEmailError: args.outcome === "sent" ? null : args.errorMessage,
      launchEmailLeaseUntil: null,
      launchEmailRunId: null,
    });

    const progress = await getProgress(ctx);
    if (!progress) return null;

    const attempts = signup.launchEmailAttempts ?? 0;
    const becameExhausted =
      args.outcome === "failed" && attempts >= LAUNCH_EMAIL_MAX_ATTEMPTS;

    await ctx.db.patch(progress._id, {
      sent: args.outcome === "sent" ? progress.sent + 1 : progress.sent,
      failed: args.outcome === "failed" ? progress.failed + 1 : progress.failed,
      unconfirmed:
        args.outcome === "unconfirmed"
          ? (progress.unconfirmed ?? 0) + 1
          : progress.unconfirmed,
      ...(becameExhausted
        ? { exhaustedFailed: (progress.exhaustedFailed ?? 0) + 1 }
        : {}),
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
    // Anything still "sending" belongs to this run and lost its result; it may
    // have been delivered, so it becomes unconfirmed rather than retryable.
    const swept = await sweepLeftoverSending(ctx, args.runId);
    const unconfirmed =
      (progress.unconfirmed ?? 0) + swept;

    if (args.isDone) {
      await ctx.db.patch(progress._id, {
        done: true,
        cursor: args.cursor,
        finishedAt: now,
        leaseUntil: null,
        runId: null,
        inFlightSignupId: null,
        lastError: null,
        unconfirmed,
      });
    } else {
      await ctx.db.patch(progress._id, {
        cursor: args.cursor,
        leaseUntil: now + LAUNCH_EMAIL_LEASE_MS,
        lastError: null,
        unconfirmed,
      });
    }

    return null;
  },
});

// Undoes a batch that hit a provider-wide error or a run of failures.
//
// In send mode, with the lease still owned, retryable recipients go back in the
// queue ahead of the unchanged cursor, so the next resume reaches them. In
// retry mode, or when a newer run now owns the lease, they stay "failed": the
// retry queue is read by state, not by the send cursor, and flipping them to
// "pending" would strand them behind that cursor and hide them from the panel.
//
// A provider-wide failure is not the recipient's fault: the attempt counter is
// rolled back for the recipient whose send aborted the batch, so a 429, a bad
// key or an outage can be clicked any number of times without exhausting that
// recipient.
export const abortLaunchEmailBatch = internalMutation({
  args: {
    runId: v.string(),
    mode: v.union(v.literal("send"), v.literal("retry")),
    signupIds: v.array(v.id("waitlistSignups")),
    providerWideSignupId: v.optional(
      v.union(v.id("waitlistSignups"), v.null()),
    ),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const progress = await getProgress(ctx);
    const ownsRun = progress?.runId === args.runId;

    const swept = ownsRun ? await sweepLeftoverSending(ctx, args.runId) : 0;

    const canRevert = ownsRun && args.mode === "send";
    let reverted = 0;
    let exhaustedDelta = 0;

    for (const signupId of args.signupIds) {
      const signup = await ctx.db.get(signupId);
      if (!signup) continue;

      // Never touch a delivered recipient, whatever a stale status says.
      if (signup.launchEmailState === "sent") continue;

      const previousAttempts = signup.launchEmailAttempts ?? 0;
      let attempts = previousAttempts;
      const providerWide = args.providerWideSignupId === signupId;
      if (providerWide && attempts > 0) {
        attempts -= 1;
        if (
          signup.launchEmailState === "failed" &&
          previousAttempts >= LAUNCH_EMAIL_MAX_ATTEMPTS &&
          attempts < LAUNCH_EMAIL_MAX_ATTEMPTS
        ) {
          exhaustedDelta -= 1;
        }
      }

      if (signup.launchEmailState !== "failed") {
        // Unconfirmed rows may have been delivered; only the counter rollback
        // applies, never a state change.
        if (providerWide) {
          await ctx.db.patch(signupId, {
            launchEmailAttempts: attempts,
            launchEmailLeaseUntil: null,
            launchEmailError: args.errorMessage,
          });
        }
        continue;
      }

      if (!canRevert || attempts >= LAUNCH_EMAIL_MAX_ATTEMPTS) {
        // Keep the row retryable (or exhausted) exactly where the retry queue
        // reads it; the send cursor cannot reach it.
        await ctx.db.patch(signupId, {
          launchEmailAttempts: attempts,
          launchEmailError: args.errorMessage,
          launchEmailLeaseUntil: null,
        });
        continue;
      }

      await ctx.db.patch(signupId, {
        launchEmailState: "pending",
        launchEmailSentAt: null,
        launchEmailError: null,
        launchEmailAttempts: attempts,
        launchEmailLeaseUntil: null,
        launchEmailRunId: null,
      });
      reverted += 1;
    }

    if (!progress) return { reverted };

    const patch: {
      failed: number;
      unconfirmed?: number;
      exhaustedFailed?: number;
      lastError?: string | null;
      inFlightSignupId?: null;
      leaseUntil?: null;
      runId?: null;
    } = {
      failed: Math.max(0, progress.failed - reverted),
    };

    if (swept > 0) {
      patch.unconfirmed = (progress.unconfirmed ?? 0) + swept;
    }
    if (exhaustedDelta !== 0) {
      patch.exhaustedFailed = Math.max(
        0,
        (progress.exhaustedFailed ?? 0) + exhaustedDelta,
      );
    }

    if (ownsRun) {
      patch.leaseUntil = null;
      patch.runId = null;
      patch.inFlightSignupId = null;
      patch.lastError = args.errorMessage;
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

    // Reached only when a batch ended without aborting, so a previous pause
    // reason no longer applies. Retry batches end here too: a row whose result
    // could not be recorded is this run's leftover and becomes unconfirmed.
    const swept = await sweepLeftoverSending(ctx, args.runId);

    await ctx.db.patch(progress._id, {
      leaseUntil: null,
      runId: null,
      lastError: null,
      ...(swept > 0
        ? { unconfirmed: (progress.unconfirmed ?? 0) + swept }
        : {}),
    });
    return null;
  },
});

// Puts failed recipients back in the queue, clears attempts left on rows that
// are already pending, and marks interrupted ones as unconfirmed, never back to
// a re-sendable state. Only used by the reset tool when nothing has been sent.
export const clearLaunchEmailAttempts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const failed = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) => q.eq("launchEmailState", "failed"))
      .take(RESET_CLEANUP_LIMIT);

    // Rows an aborted batch put back in the queue keep the attempt count that
    // batch gave them; a reset must give them a fresh set too.
    const pending = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) =>
        q.eq("launchEmailState", "pending"),
      )
      .take(RESET_CLEANUP_LIMIT);

    const sending = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) =>
        q.eq("launchEmailState", "sending"),
      )
      .take(RESET_CLEANUP_LIMIT);

    for (const row of failed) {
      // Reset is only allowed before anything was delivered, so it is safe to
      // give these recipients a fresh set of attempts.
      await ctx.db.patch(row._id, {
        launchEmailState: "pending",
        launchEmailSentAt: null,
        launchEmailError: null,
        launchEmailAttempts: 0,
        launchEmailLeaseUntil: null,
        launchEmailRunId: null,
      });
    }

    for (const row of pending) {
      await ctx.db.patch(row._id, {
        launchEmailError: null,
        launchEmailAttempts: 0,
        launchEmailLeaseUntil: null,
        launchEmailRunId: null,
      });
    }

    for (const row of sending) {
      await ctx.db.patch(row._id, {
        launchEmailState: "unconfirmed",
        launchEmailSentAt: null,
        launchEmailError: "Interrupted before delivery was confirmed",
        launchEmailLeaseUntil: null,
        launchEmailRunId: null,
      });
    }

    if (sending.length > 0) {
      const progress = await getProgress(ctx);
      // No counter yet: leave it unset so the status query keeps counting the
      // index exactly instead of pinning a value that omits older rows.
      if (progress && progress.unconfirmed !== undefined) {
        await ctx.db.patch(progress._id, {
          unconfirmed: progress.unconfirmed + sending.length,
        });
      }
    }

    const cleared = failed.length + pending.length + sending.length;
    if (
      failed.length === RESET_CLEANUP_LIMIT ||
      pending.length === RESET_CLEANUP_LIMIT ||
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

// Gives rows that failed every attempt a fresh set so the admin can try them
// again after fixing the cause. They stay "failed", which is what the retry
// queue reads.
export const clearExhaustedLaunchEmailAttempts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState_and_launchEmailAttempts", (q) =>
        q
          .eq("launchEmailState", "failed")
          .gte("launchEmailAttempts", LAUNCH_EMAIL_MAX_ATTEMPTS),
      )
      .take(RESET_CLEANUP_LIMIT);

    for (const row of rows) {
      await ctx.db.patch(row._id, {
        launchEmailAttempts: 0,
        launchEmailError: null,
        launchEmailLeaseUntil: null,
      });
    }

    const progress = await getProgress(ctx);
    if (progress && rows.length > 0) {
      // The rows just cleared no longer appear in the range, so counting now
      // gives the exact remainder. A maintained counter is simply decremented.
      let remaining: number | undefined;
      if (progress.exhaustedFailed === undefined) {
        remaining = 0;
        for await (const _row of ctx.db
          .query("waitlistSignups")
          .withIndex("by_launchEmailState_and_launchEmailAttempts", (q) =>
            q
              .eq("launchEmailState", "failed")
              .gte("launchEmailAttempts", LAUNCH_EMAIL_MAX_ATTEMPTS),
          )) {
          remaining += 1;
        }
      }
      await ctx.db.patch(progress._id, {
        exhaustedFailed:
          remaining ?? Math.max(0, (progress.exhaustedFailed ?? 0) - rows.length),
      });
    }

    if (rows.length === RESET_CLEANUP_LIMIT) {
      await ctx.scheduler.runAfter(
        0,
        internal.launchHelpers.clearExhaustedLaunchEmailAttempts,
        {},
      );
    }

    return { cleared: rows.length };
  },
});

// Deliberate admin action: an unconfirmed recipient may already have received
// the email. Requeuing moves it back to `pending` and reopens the run from the
// start of the list (sent, failed and unconfirmed rows are still skipped), so
// the duplicate risk is explicit and chosen by a human, never automatic.
export const requeueUnconfirmedBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) =>
        q.eq("launchEmailState", "unconfirmed"),
      )
      .take(REQUEUE_LIMIT);

    for (const row of rows) {
      await ctx.db.patch(row._id, {
        launchEmailState: "pending",
        launchEmailSentAt: null,
        launchEmailError: null,
        launchEmailAttempts: 0,
        launchEmailLeaseUntil: null,
        launchEmailRunId: null,
      });
    }

    const progress = await getProgress(ctx);
    if (progress) {
      const leaseActive = (progress.leaseUntil ?? 0) > Date.now();
      // The requeued rows no longer appear in the index, so counting now gives
      // the exact remainder when no counter has been maintained yet.
      let remaining: number | undefined;
      if (progress.unconfirmed === undefined) {
        remaining = 0;
        for await (const _row of ctx.db
          .query("waitlistSignups")
          .withIndex("by_launchEmailState", (q) =>
            q.eq("launchEmailState", "unconfirmed"),
          )) {
          remaining += 1;
        }
      }
      await ctx.db.patch(progress._id, {
        unconfirmed:
          remaining ?? Math.max(0, (progress.unconfirmed ?? 0) - rows.length),
        // The requeued rows are behind the old cursor; walking the list again
        // reaches them while the scan still skips everyone already sent.
        ...(leaseActive
          ? {}
          : {
              done: false,
              cursor: null,
              finishedAt: null,
              lastError: null,
            }),
      });
    }

    if (rows.length === REQUEUE_LIMIT) {
      await ctx.scheduler.runAfter(
        0,
        internal.launchHelpers.requeueUnconfirmedBatch,
        {},
      );
    }

    return { requeued: rows.length };
  },
});
