import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import {
  countUnsubscribedWaitlistRows,
  isLaunchEmailSendingLive,
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

type SettlementDelta = {
  // Rows that become unconfirmed.
  unconfirmed: number;
  // Rows that become terminal opt-outs.
  unsubscribed: number;
  // Counts to remove from the failed / exhausted-failed denominators when a
  // stale failed row is settled as an opt-out.
  failed: number;
  exhaustedFailed: number;
};

function emptySettlementDelta(): SettlementDelta {
  return {
    unconfirmed: 0,
    unsubscribed: 0,
    failed: 0,
    exhaustedFailed: 0,
  };
}

// Adds a delta's changes to a progress row. Failed and exhausted-failed are
// decremented, never allowed below zero.
function settlementPatch(
  progress: ProgressDoc,
  delta: SettlementDelta,
) {
  return {
    unconfirmed: Math.max(0, (progress.unconfirmed ?? 0) + delta.unconfirmed),
    unsubscribed: Math.max(0, (progress.unsubscribed ?? 0) + delta.unsubscribed),
    failed: Math.max(0, progress.failed - delta.failed),
    exhaustedFailed: Math.max(
      0,
      (progress.exhaustedFailed ?? 0) - delta.exhaustedFailed,
    ),
  };
}

// At the end of a batch nothing it owned is in flight any more, so any row it
// left "sending" is an attempt whose result was never recorded: mark it
// unconfirmed rather than leaving it invisible or retryable. A row opted out
// mid-attempt settles as the disjoint Unsubscribed bucket instead.
async function sweepLeftoverSending(
  ctx: MutationCtx,
  runId: string,
): Promise<SettlementDelta> {
  const rows = await ctx.db
    .query("waitlistSignups")
    .withIndex("by_launchEmailState", (q) => q.eq("launchEmailState", "sending"))
    .take(LEFTOVER_SWEEP_LIMIT);

  const now = Date.now();
  const delta = emptySettlementDelta();
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

    // An opted-out row is not a delivery to settle: it is terminal, and it must
    // not inflate the unconfirmed count.
    if (row.unsubscribedAt !== undefined) {
      await ctx.db.patch(row._id, {
        launchEmailState: "unsubscribed",
        launchEmailSentAt: null,
        launchEmailError: null,
        launchEmailLeaseUntil: null,
        launchEmailRunId: null,
      });
      delta.unsubscribed += 1;
      continue;
    }

    await ctx.db.patch(row._id, {
      launchEmailState: "unconfirmed",
      launchEmailSentAt: null,
      launchEmailError: "Delivery was not confirmed",
      launchEmailLeaseUntil: null,
      launchEmailRunId: null,
    });
    delta.unconfirmed += 1;
  }

  return delta;
}

async function getConfig(ctx: MutationCtx) {
  return await ctx.db.query("launchConfig").first();
}

async function getProgress(ctx: MutationCtx) {
  return await ctx.db.query("launchEmailProgress").first();
}

type ProgressDoc = Doc<"launchEmailProgress">;

// A "sending" row left by a dead run is indistinguishable from an unconfirmed
// delivery. Converting it before listing or requeueing unconfirmed rows keeps
// the list and the count in agreement, and keeps the row unreachable by an
// automatic send. Rows a live attempt still owns are never touched.
async function convertStaleSendingRows(
  ctx: MutationCtx,
  progress: ProgressDoc | null,
  limit: number,
) {
  const rows = await ctx.db
    .query("waitlistSignups")
    .withIndex("by_launchEmailState", (q) => q.eq("launchEmailState", "sending"))
    .take(limit);

  const now = Date.now();
  const delta = emptySettlementDelta();
  for (const row of rows) {
    if (isLaunchEmailSendingLive(row, progress, now)) continue;

    // Opted-out leftovers are terminal, never "unconfirmed", and their
    // opt-out was deferred while the attempt was in flight.
    if (row.unsubscribedAt !== undefined) {
      await ctx.db.patch(row._id, {
        launchEmailState: "unsubscribed",
        launchEmailSentAt: null,
        launchEmailError: null,
        launchEmailLeaseUntil: null,
        launchEmailRunId: null,
      });
      delta.unsubscribed += 1;
      continue;
    }

    await ctx.db.patch(row._id, {
      launchEmailState: "unconfirmed",
      launchEmailSentAt: null,
      launchEmailError: "Delivery was not confirmed",
      launchEmailLeaseUntil: null,
      launchEmailRunId: null,
    });
    delta.unconfirmed += 1;
  }

  if (progress && (delta.unconfirmed > 0 || delta.unsubscribed > 0)) {
    const unsubscribed =
      delta.unsubscribed > 0 && progress.unsubscribed === undefined
        ? await countUnsubscribedWaitlistRows(ctx)
        : (progress.unsubscribed ?? 0) + delta.unsubscribed;
    await ctx.db.patch(progress._id, {
      unconfirmed: (progress.unconfirmed ?? 0) + delta.unconfirmed,
      unsubscribed,
    });
  }

  return delta;
}

// An opt-out can race a send and leave a queued row carrying `unsubscribedAt`
// after its state was written. Such a row is skipped by every send and retry
// selection but would still sit in the failed/unconfirmed/pending state
// forever, keeping "Retry Failed" non-zero or the run not done. Settle those
// rows to the terminal `unsubscribed` state and move their counters into the
// disjoint Unsubscribed bucket.
async function settleOptedOutQueuedRows(
  ctx: MutationCtx,
  limit: number,
): Promise<SettlementDelta> {
  const delta = emptySettlementDelta();

  const pending = await ctx.db
    .query("waitlistSignups")
    .withIndex("by_launchEmailState", (q) =>
      q.eq("launchEmailState", "pending"),
    )
    .take(limit);
  for (const row of pending) {
    if (row.unsubscribedAt === undefined) continue;
    await ctx.db.patch(row._id, {
      launchEmailState: "unsubscribed",
      launchEmailSentAt: null,
      launchEmailError: null,
      launchEmailLeaseUntil: null,
      launchEmailRunId: null,
    });
    delta.unsubscribed += 1;
  }

  const failed = await ctx.db
    .query("waitlistSignups")
    .withIndex("by_launchEmailState", (q) =>
      q.eq("launchEmailState", "failed"),
    )
    .take(limit);
  for (const row of failed) {
    if (row.unsubscribedAt === undefined) continue;
    const exhausted =
      (row.launchEmailAttempts ?? 0) >= LAUNCH_EMAIL_MAX_ATTEMPTS;
    await ctx.db.patch(row._id, {
      launchEmailState: "unsubscribed",
      launchEmailSentAt: null,
      launchEmailError: null,
      launchEmailLeaseUntil: null,
      launchEmailRunId: null,
    });
    delta.unsubscribed += 1;
    delta.failed += 1;
    if (exhausted) delta.exhaustedFailed += 1;
  }

  const unconfirmed = await ctx.db
    .query("waitlistSignups")
    .withIndex("by_launchEmailState", (q) =>
      q.eq("launchEmailState", "unconfirmed"),
    )
    .take(limit);
  for (const row of unconfirmed) {
    if (row.unsubscribedAt === undefined) continue;
    await ctx.db.patch(row._id, {
      launchEmailState: "unsubscribed",
      launchEmailSentAt: null,
      launchEmailError: null,
      launchEmailLeaseUntil: null,
      launchEmailRunId: null,
    });
    delta.unsubscribed += 1;
    delta.unconfirmed -= 1;
  }

  return delta;
}

// Exact denominators are maintained going forward. A progress document written
// before they existed is rebuilt once, by reading the two state indexes, so the
// panel never has to sample a capped page.
async function backfillProgressCounters(
  ctx: MutationCtx,
  progress: ProgressDoc,
): Promise<ProgressDoc> {
  if (
    progress.exhaustedFailed !== undefined &&
    progress.unconfirmed !== undefined &&
    progress.unsubscribed !== undefined
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

  const unsubscribed = await countUnsubscribedWaitlistRows(ctx);
  await ctx.db.patch(progress._id, {
    exhaustedFailed,
    unconfirmed,
    unsubscribed,
  });
  return { ...progress, exhaustedFailed, unconfirmed, unsubscribed };
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
    unsubscribed: await countUnsubscribedWaitlistRows(ctx),
  });

  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create launch email progress");
  return created;
}

// A dead run can leave one recipient marked "sending": the email may or may
// not have gone out. Record it as unconfirmed instead of failed, so no
// automatic retry can deliver a second copy; the admin sees it in the panel.
// Returns the counter delta so the caller can update both buckets.
async function recoverInterruptedAttempt(
  ctx: MutationCtx,
  progress: ProgressDoc,
): Promise<SettlementDelta> {
  const inFlightId = progress.inFlightSignupId;
  if (!inFlightId) return emptySettlementDelta();

  const signup = await ctx.db.get(inFlightId);
  if (!signup || signup.launchEmailState !== "sending") {
    await ctx.db.patch(progress._id, { inFlightSignupId: null });
    return emptySettlementDelta();
  }

  // An opt-out recorded while the attempt was in flight: the attempt still
  // settles, but as the terminal opt-out state and without counting as an
  // unconfirmed delivery. Its opt-out was deferred, so count it here.
  if (signup.unsubscribedAt !== undefined) {
    await ctx.db.patch(signup._id, {
      launchEmailState: "unsubscribed",
      launchEmailSentAt: null,
      launchEmailError: null,
      launchEmailLeaseUntil: null,
      launchEmailRunId: null,
    });
    await ctx.db.patch(progress._id, { inFlightSignupId: null });
    return { ...emptySettlementDelta(), unsubscribed: 1 };
  }

  await ctx.db.patch(signup._id, {
    launchEmailState: "unconfirmed",
    launchEmailSentAt: null,
    launchEmailError: "Interrupted before delivery was confirmed",
    launchEmailLeaseUntil: null,
    launchEmailRunId: null,
  });
  await ctx.db.patch(progress._id, { inFlightSignupId: null });
  return { ...emptySettlementDelta(), unconfirmed: 1 };
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
        unsubscribed: await countUnsubscribedWaitlistRows(ctx),
      });

      return { started: true, reason: null, resumed: false, cursor: null };
    }

    let progress = await ensureProgress(ctx, config);
    progress = await backfillProgressCounters(ctx, progress);

    const settled = await settleOptedOutQueuedRows(
      ctx,
      RESET_CLEANUP_LIMIT,
    );
    if (
      settled.failed > 0 ||
      settled.unconfirmed !== 0 ||
      settled.unsubscribed > 0
    ) {
      await ctx.db.patch(progress._id, settlementPatch(progress, settled));
      progress = (await ctx.db.get(progress._id)) ?? progress;
    }

    // A finished send can be started again only to deliver recipients the
    // admin deliberately requeued from `unconfirmed` (they are `pending`).
    // Everyone sent, failed or unconfirmed is still skipped by the scan, so
    // this cannot re-send to anyone who already received the mail. A pending
    // row that is opted out is not a requeue and must not reopen the run.
    let restartForRequeued = false;
    if (args.mode === "send" && progress.done) {
      const pending = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_launchEmailState", (q) =>
          q.eq("launchEmailState", "pending"),
        )
        .take(RESET_CLEANUP_LIMIT);
      const mayHaveRequeue =
        pending.length === RESET_CLEANUP_LIMIT ||
        pending.some((row) => row.unsubscribedAt === undefined);
      if (!mayHaveRequeue) {
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

    let recovered = emptySettlementDelta();
    if (!restartForRequeued && progress.runId !== args.runId) {
      recovered = await recoverInterruptedAttempt(ctx, progress);
    }

    // A new attempt clears the previous pause reason; a batch that aborts sets
    // it again.
    await ctx.db.patch(progress._id, {
      leaseUntil: now + LAUNCH_EMAIL_LEASE_MS,
      runId: args.runId,
      lastError: null,
      ...(recovered.unconfirmed !== 0 || recovered.unsubscribed !== 0
        ? settlementPatch(progress, recovered)
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
          // Opted out: never send again, whatever the state says.
          signup.launchEmailState !== "unsubscribed" &&
          signup.unsubscribedAt === undefined &&
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
    // A row failed before attempts were recorded can match both the index
    // range below and the state-index scan after it, so collect it once.
    const seen = new Set<Id<"waitlistSignups">>();

    const retryable = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState_and_launchEmailAttempts", (q) =>
        q
          .eq("launchEmailState", "failed")
          .lt("launchEmailAttempts", LAUNCH_EMAIL_MAX_ATTEMPTS),
      )
      .take(args.limit);

    for (const signup of retryable) {
      if (seen.has(signup._id)) continue;
      // A retry must never reach somebody who opted out.
      if (signup.unsubscribedAt !== undefined) continue;
      seen.add(signup._id);
      recipients.push({ _id: signup._id, email: signup.email });
    }

    // Rows failed before attempts were recorded are the oldest rows. Scan the
    // state index for any the range did not return, and skip ids already
    // collected: without the de-duplication the same row could be sent twice
    // in one batch, inflating its attempts and tripping the consecutive-failure
    // pause.
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
        if (signup.unsubscribedAt !== undefined) continue;
        if (seen.has(signup._id)) continue;
        seen.add(signup._id);
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

    // Defence in depth: even a row that was somehow left queued for an
    // opted-out recipient must not start.
    if (signup.unsubscribedAt !== undefined) {
      return { started: false as const, reason: "unsubscribed" as const };
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

    // The unsubscribe token is signed with a timestamp. It is fixed on the
    // first attempt and reused, so a retry sends a byte-identical body under
    // the same provider idempotency key; a fresh timestamp would make the
    // provider return 409 and could lead to a second accepted copy.
    const unsubscribeIssuedAt =
      signup.launchEmailUnsubscribeIssuedAt ?? Date.now();

    await ctx.db.patch(args.signupId, {
      launchEmailState: "sending",
      launchEmailSentAt: null,
      launchEmailError: null,
      launchEmailAttempts: attempts + 1,
      launchEmailLeaseUntil: Date.now() + LAUNCH_EMAIL_LEASE_MS,
      launchEmailRunId: args.runId,
      launchEmailUnsubscribeIssuedAt: unsubscribeIssuedAt,
    });

    await ctx.db.patch(progress._id, {
      inFlightSignupId: args.signupId,
      leaseUntil: Date.now() + LAUNCH_EMAIL_LEASE_MS,
      ...(wasFailed ? { failed: Math.max(0, progress.failed - 1) } : {}),
    });

    return {
      started: true as const,
      reason: null,
      unsubscribeIssuedAt,
    };
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
    // The provider's message id when the send returned one, so a delivered
    // email stays reconcilable with the provider's log.
    providerId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const signup = await ctx.db.get(args.signupId);
    if (!signup || signup.launchEmailState !== "sending") return null;

    const progress = await getProgress(ctx);
    const optedOutDuringSend = signup.unsubscribedAt !== undefined;

    // The recipient opted out while this attempt was in flight. An opt-out
    // cannot recall the message, but a definitive rejection (or an ambiguous
    // failure) must settle as the terminal opt-out state: a "failed" row that
    // is also opted out would otherwise show in Retry Failed forever while the
    // retry selection skips it. A delivery that did happen stays "sent": it is
    // counted once in Sent, never also in Unsubscribed.
    if (optedOutDuringSend && args.outcome !== "sent") {
      await ctx.db.patch(args.signupId, {
        launchEmailState: "unsubscribed",
        launchEmailSentAt: null,
        launchEmailError: null,
        launchEmailProviderId: args.providerId ?? null,
        launchEmailLeaseUntil: null,
        launchEmailRunId: null,
      });

      if (progress) {
        await ctx.db.patch(progress._id, {
          unsubscribed:
            progress.unsubscribed === undefined
              ? await countUnsubscribedWaitlistRows(ctx)
              : progress.unsubscribed + 1,
          ...(progress.inFlightSignupId === args.signupId
            ? { inFlightSignupId: null }
            : {}),
        });
      }
      return null;
    }

    await ctx.db.patch(args.signupId, {
      launchEmailState: args.outcome,
      launchEmailSentAt: args.outcome === "sent" ? Date.now() : null,
      launchEmailError: args.outcome === "sent" ? null : args.errorMessage,
      launchEmailProviderId: args.providerId ?? null,
      launchEmailLeaseUntil: null,
      launchEmailRunId: null,
    });

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
    // have been delivered, so it becomes unconfirmed rather than retryable. An
    // opted-out leftover settles as Unsubscribed instead.
    const swept = await sweepLeftoverSending(ctx, args.runId);
    const counters = settlementPatch(progress, swept);

    if (args.isDone) {
      await ctx.db.patch(progress._id, {
        done: true,
        cursor: args.cursor,
        finishedAt: now,
        leaseUntil: null,
        runId: null,
        inFlightSignupId: null,
        lastError: null,
        ...counters,
      });
    } else {
      await ctx.db.patch(progress._id, {
        cursor: args.cursor,
        leaseUntil: now + LAUNCH_EMAIL_LEASE_MS,
        lastError: null,
        ...counters,
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

    const swept = ownsRun
      ? await sweepLeftoverSending(ctx, args.runId)
      : emptySettlementDelta();

    const canRevert = ownsRun && args.mode === "send";
    let reverted = 0;
    let settledFailed = 0;
    let settledUnconfirmed = 0;
    let settledUnsubscribed = 0;
    let exhaustedDelta = 0;

    for (const signupId of args.signupIds) {
      const signup = await ctx.db.get(signupId);
      if (!signup) continue;

      // Never touch a delivered recipient, whatever a stale status says.
      if (signup.launchEmailState === "sent") continue;

      // An opt-out recorded while the attempt was in flight must settle as the
      // terminal state, never be reverted to "pending" (which would keep the
      // run waiting on it forever) or left "failed" (which would show an
      // unretryable row in Retry Failed).
      if (signup.unsubscribedAt !== undefined) {
        if (signup.launchEmailState === "unsubscribed") continue;

        const previousState = signup.launchEmailState;
        await ctx.db.patch(signupId, {
          launchEmailState: "unsubscribed",
          launchEmailSentAt: null,
          launchEmailError: null,
          launchEmailLeaseUntil: null,
          launchEmailRunId: null,
        });
        settledUnsubscribed += 1;

        if (previousState === "failed") {
          settledFailed += 1;
          if (
            (signup.launchEmailAttempts ?? 0) >= LAUNCH_EMAIL_MAX_ATTEMPTS
          ) {
            exhaustedDelta -= 1;
          }
        } else if (previousState === "unconfirmed") {
          settledUnconfirmed += 1;
        }
        continue;
      }

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
      unconfirmed: number;
      unsubscribed: number;
      exhaustedFailed?: number;
      lastError?: string | null;
      inFlightSignupId?: null;
      leaseUntil?: null;
      runId?: null;
    } = {
      failed: Math.max(0, progress.failed - reverted - settledFailed),
      unconfirmed: Math.max(
        0,
        (progress.unconfirmed ?? 0) - settledUnconfirmed + swept.unconfirmed,
      ),
      unsubscribed: Math.max(
        0,
        (progress.unsubscribed ?? 0) +
          settledUnsubscribed +
          swept.unsubscribed,
      ),
    };

    if (exhaustedDelta !== 0) {
      patch.exhaustedFailed = Math.max(
        0,
        (progress.exhaustedFailed ?? 0) + exhaustedDelta,
      );
    }

    if (
      progress.unsubscribed === undefined &&
      patch.unsubscribed > 0
    ) {
      patch.unsubscribed = await countUnsubscribedWaitlistRows(ctx);
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
      ...settlementPatch(progress, swept),
    });
    return null;
  },
});

// Puts failed recipients back in the queue, clears attempts left on rows that
// are already pending, and marks interrupted ones as unconfirmed, never back to
// a re-sendable state. Only used by the reset tool when nothing has been sent.
//
// This mutation schedules itself to finish a large table. Every row it touches
// leaves the range it was selected from: failed becomes pending, pending
// becomes attempts 0 (so it no longer matches `attempts > 0`), and sending
// becomes unconfirmed. That makes each invocation strictly shrink the
// remaining work, so the self-scheduling below cannot loop, and an invocation
// that changes nothing schedules nothing.
export const clearLaunchEmailAttempts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const failed = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) => q.eq("launchEmailState", "failed"))
      .take(RESET_CLEANUP_LIMIT);

    // Rows an aborted batch put back in the queue keep the attempt count that
    // batch gave them; a reset must give them a fresh set too. Only rows that
    // still carry attempts are selected, so clearing one takes it out of this
    // range.
    const pending = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState_and_launchEmailAttempts", (q) =>
        q
          .eq("launchEmailState", "pending")
          .gt("launchEmailAttempts", 0),
      )
      .take(RESET_CLEANUP_LIMIT);

    const sending = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) =>
        q.eq("launchEmailState", "sending"),
      )
      .take(RESET_CLEANUP_LIMIT);

    const progress = await getProgress(ctx);
    const now = Date.now();

    let cleared = 0;
    let settledFailed = 0;
    let settledExhausted = 0;
    let settledUnsubscribed = 0;
    for (const row of failed) {
      // An opt-out that predates this reset stays terminal: a reset may give
      // failed recipients a fresh set of attempts, never consent.
      if (row.unsubscribedAt !== undefined) {
        await ctx.db.patch(row._id, {
          launchEmailState: "unsubscribed",
          launchEmailSentAt: null,
          launchEmailError: null,
          launchEmailAttempts: 0,
          launchEmailLeaseUntil: null,
          launchEmailRunId: null,
        });
        settledFailed += 1;
        settledUnsubscribed += 1;
        if ((row.launchEmailAttempts ?? 0) >= LAUNCH_EMAIL_MAX_ATTEMPTS) {
          settledExhausted += 1;
        }
        cleared += 1;
        continue;
      }

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
      cleared += 1;
    }

    for (const row of pending) {
      // A pending row that opted out is terminal, never reset into the queue.
      if (row.unsubscribedAt !== undefined) {
        await ctx.db.patch(row._id, {
          launchEmailState: "unsubscribed",
          launchEmailSentAt: null,
          launchEmailError: null,
          launchEmailAttempts: 0,
          launchEmailLeaseUntil: null,
          launchEmailRunId: null,
        });
        settledUnsubscribed += 1;
        cleared += 1;
        continue;
      }

      await ctx.db.patch(row._id, {
        launchEmailError: null,
        launchEmailAttempts: 0,
        launchEmailLeaseUntil: null,
        launchEmailRunId: null,
      });
      cleared += 1;
    }

    // A send can start after the reset while this cleanup is still running.
    // Its in-flight row is owned by a live attempt and must not be swept, or a
    // delivered email would be turned into "unconfirmed". A stale sending row
    // that opted out is terminal, not unconfirmed.
    let swept = 0;
    for (const row of sending) {
      if (isLaunchEmailSendingLive(row, progress, now)) continue;

      if (row.unsubscribedAt !== undefined) {
        await ctx.db.patch(row._id, {
          launchEmailState: "unsubscribed",
          launchEmailSentAt: null,
          launchEmailError: null,
          launchEmailLeaseUntil: null,
          launchEmailRunId: null,
        });
        settledUnsubscribed += 1;
        cleared += 1;
        continue;
      }

      await ctx.db.patch(row._id, {
        launchEmailState: "unconfirmed",
        launchEmailSentAt: null,
        launchEmailError: "Interrupted before delivery was confirmed",
        launchEmailLeaseUntil: null,
        launchEmailRunId: null,
      });
      swept += 1;
      cleared += 1;
    }

    if (
      progress &&
      (swept > 0 ||
        settledFailed > 0 ||
        settledExhausted > 0 ||
        settledUnsubscribed > 0)
    ) {
      await ctx.db.patch(progress._id, {
        unconfirmed: (progress.unconfirmed ?? 0) + swept,
        unsubscribed:
          progress.unsubscribed === undefined && settledUnsubscribed > 0
            ? await countUnsubscribedWaitlistRows(ctx)
            : (progress.unsubscribed ?? 0) + settledUnsubscribed,
        failed: Math.max(0, progress.failed - settledFailed),
        ...(settledExhausted > 0
          ? {
              exhaustedFailed: Math.max(
                0,
                (progress.exhaustedFailed ?? 0) - settledExhausted,
              ),
            }
          : {}),
      });
    }

    const pageFull =
      failed.length === RESET_CLEANUP_LIMIT ||
      pending.length === RESET_CLEANUP_LIMIT ||
      sending.length === RESET_CLEANUP_LIMIT;

    // Only continue when a page filled up and this invocation actually made
    // progress. A page of already-clean pending rows used to reschedule itself
    // for ever; it cannot now, because such rows are never selected and the
    // `cleared` guard stops a no-op pass from scheduling another.
    if (pageFull && cleared > 0) {
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
    // A crashed run can leave rows "sending" while the panel already counts
    // them as unconfirmed. Settle them first so this action requeues the rows
    // the operator was warned about instead of reporting zero.
    let progress = await getProgress(ctx);
    const converted = await convertStaleSendingRows(
      ctx,
      progress,
      REQUEUE_LIMIT,
    );
    if (
      progress &&
      (converted.unconfirmed !== 0 || converted.unsubscribed !== 0)
    ) {
      progress = (await ctx.db.get(progress._id)) ?? progress;
    }

    const rows = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) =>
        q.eq("launchEmailState", "unconfirmed"),
      )
      .take(REQUEUE_LIMIT);

    let skippedUnsubscribed = 0;
    for (const row of rows) {
      // An opted-out row that a crashed attempt left unconfirmed is settled as
      // a terminal opt-out instead of being requeued. It still leaves the
      // unconfirmed range, so the self-scheduling chain terminates.
      if (row.unsubscribedAt !== undefined) {
        await ctx.db.patch(row._id, {
          launchEmailState: "unsubscribed",
          launchEmailSentAt: null,
          launchEmailError: null,
          launchEmailLeaseUntil: null,
          launchEmailRunId: null,
        });
        skippedUnsubscribed += 1;
        continue;
      }

      await ctx.db.patch(row._id, {
        launchEmailState: "pending",
        launchEmailSentAt: null,
        launchEmailError: null,
        launchEmailAttempts: 0,
        launchEmailLeaseUntil: null,
        launchEmailRunId: null,
      });
    }

    if (progress) {
      const leaseActive = (progress.leaseUntil ?? 0) > Date.now();
      // The requeued rows no longer appear in the index, so counting now gives
      // the exact remainder when no counter has been maintained yet. Opted-out
      // rows leave Unconfirmed and are counted exactly once in Unsubscribed.
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
        unsubscribed:
          progress.unsubscribed === undefined && skippedUnsubscribed > 0
            ? await countUnsubscribedWaitlistRows(ctx)
            : (progress.unsubscribed ?? 0) + skippedUnsubscribed,
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

    // Both operations take their rows out of the range they were read from, so
    // each pass makes progress and the chain terminates.
    if (
      rows.length === REQUEUE_LIMIT ||
      converted.unconfirmed === REQUEUE_LIMIT ||
      converted.unsubscribed === REQUEUE_LIMIT
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.launchHelpers.requeueUnconfirmedBatch,
        {},
      );
    }

    return {
      requeued: rows.length - skippedUnsubscribed,
      converted: converted.unconfirmed + converted.unsubscribed,
    };
  },
});
