import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { query, mutation, type QueryCtx } from "./_generated/server";
import { assertAdmin } from "./lib/admin";
import {
  countUnsubscribedWaitlistRows,
  isLaunchEmailSendingLive,
  isLegacyLaunchEmailSent,
  LAUNCH_EMAIL_MAX_ATTEMPTS,
  readLaunchEmailProgress,
} from "./lib/launchEmail";

// Upper bound on the unconfirmed/stale rows one status read inspects. The
// counters below are authoritative; this sample only feeds the "100+" style
// display and the stale in-flight check.
const STATUS_SAMPLE_LIMIT = 100;

// Counting the legacy denominators (progress rows written before counters
// existed) is a one-time rebuild; bound how many rows it reads.
const LEGACY_COUNT_SCAN_LIMIT = 10_000;

async function countLaunchEmailState(
  ctx: { db: QueryCtx["db"] },
  state: "failed" | "unconfirmed",
) {
  let count = 0;
  for await (const row of ctx.db
    .query("waitlistSignups")
    .withIndex("by_launchEmailState", (q) =>
      q.eq("launchEmailState", state),
    )) {
    if (!row) continue;
    count += 1;
    if (count >= LEGACY_COUNT_SCAN_LIMIT) break;
  }
  return count;
}

// A failed row is only "exhausted" when it used up its attempts. Counting all
// failed rows (as an older progress row without the counter forced us to) would
// report every failure as un-retryable.
async function countExhaustedFailed(ctx: { db: QueryCtx["db"] }) {
  let count = 0;
  for await (const row of ctx.db
    .query("waitlistSignups")
    .withIndex("by_launchEmailState_and_launchEmailAttempts", (q) =>
      q
        .eq("launchEmailState", "failed")
        .gte("launchEmailAttempts", LAUNCH_EMAIL_MAX_ATTEMPTS),
    )) {
    count += 1;
    if (count >= LEGACY_COUNT_SCAN_LIMIT) break;
  }
  return count;
}

// A failed row that opted out (a race the record-result/claim paths settle) is
// not retryable: the retry selection always skips it. Excluding the non-
// exhausted ones here keeps the panel from showing a retry count that can never
// be spent. Exhausted rows are already excluded through the exhausted counter.
async function countRetryableOptedOutFailed(ctx: { db: QueryCtx["db"] }) {
  let count = 0;
  for await (const row of ctx.db
    .query("waitlistSignups")
    .withIndex("by_launchEmailState", (q) =>
      q.eq("launchEmailState", "failed"),
    )) {
    if (row.unsubscribedAt === undefined) continue;
    if ((row.launchEmailAttempts ?? 0) >= LAUNCH_EMAIL_MAX_ATTEMPTS) continue;
    count += 1;
    if (count >= LEGACY_COUNT_SCAN_LIMIT) break;
  }
  return count;
}

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

    const now = Date.now();

    // Counts are maintained exactly on the progress row. A progress row written
    // before the counters existed is rebuilt once from the state indexes, so
    // the panel never derives a count from a capped sample.
    const exhaustedFailed =
      progress?.exhaustedFailed ?? (await countExhaustedFailed(ctx));
    const unconfirmedCount =
      progress?.unconfirmed ??
      (await countLaunchEmailState(ctx, "unconfirmed"));

    // Opt-outs are shown separately: they are skipped by every send, so they
    // are not part of "sent", "failed" or "unconfirmed" denominators.
    const unsubscribed =
      progress?.unsubscribed ?? (await countUnsubscribedWaitlistRows(ctx));

    // A crash during a retry leaves rows "sending". Once the attempt is no
    // longer live, the delivery was never recorded and the row is just as
    // unconfirmed as one marked explicitly, so count it that way instead of
    // letting it stay invisible. The same helper decides for the list below, so
    // the two always agree.
    const sending = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) =>
        q.eq("launchEmailState", "sending"),
      )
      .take(STATUS_SAMPLE_LIMIT);
    const staleSendingRows = sending.filter(
      (signup) => !isLaunchEmailSendingLive(signup, progress, now),
    );
    // An opted-out stale attempt belongs in Unsubscribed, not Unconfirmed:
    // keep the two displayed buckets disjoint.
    const staleSending = staleSendingRows.filter(
      (signup) => signup.unsubscribedAt === undefined,
    ).length;
    const staleSendingUnsubscribed = staleSendingRows.length - staleSending;

    // Rows that used up their attempts are still failed but are not offered for
    // a retry, so the button shows the retryable count and the panel explains
    // the rest. Rows that opted out are excluded even before a write path
    // settles them: they are never retried.
    const optedOutFailed = await countRetryableOptedOutFailed(ctx);
    const retryableFailed = Math.max(
      0,
      ledger.failed -
        Math.min(ledger.failed, exhaustedFailed) -
        optedOutFailed,
    );

    // Requeued unconfirmed recipients are `pending` and sit behind the old
    // cursor. Report the run as resumable so the panel offers the button that
    // walks the list again to reach them. A pending row that opted out is not
    // a requeue and must not keep the run open.
    let done = legacy ? true : ledger.done;
    if (!legacy && done) {
      const pending = await ctx.db
        .query("waitlistSignups")
        .withIndex("by_launchEmailState", (q) =>
          q.eq("launchEmailState", "pending"),
        )
        .take(STATUS_SAMPLE_LIMIT);
      if (
        pending.length === STATUS_SAMPLE_LIMIT ||
        pending.some((row) => row.unsubscribedAt === undefined)
      ) {
        done = false;
      }
    }

    return {
      claimed: config?.launchEmailSent ?? false,
      done,
      legacy,
      sent: ledger.sent,
      failed: ledger.failed,
      retryableFailed,
      exhaustedFailed,
      unconfirmed: unconfirmedCount + staleSending,
      unsubscribed: unsubscribed + staleSendingUnsubscribed,
      running: !legacy && (ledger.leaseUntil ?? 0) > now,
      // Until the run releases its lease (up to a minute after a tab closes),
      // a resume is refused. The panel counts this down.
      leaseUntil: legacy ? null : ledger.leaseUntil,
      // Set when a batch stopped early on a provider error or a run of
      // failures. The panel shows "paused" rather than "finished".
      pausedError: legacy ? null : ledger.lastError,
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
        lastError: null,
        exhaustedFailed: 0,
      });
    }

    return { reset: true };
  },
});

// The recipients deliberately requeued from `unconfirmed` are `pending` and
// behind the old cursor. The panel uses this to say how many recipients a send
// would attempt before showing its confirmation dialog.
export const getLaunchEmailRecipientCount = query({
  args: {},
  handler: async (ctx) => {
    await assertAdmin(ctx);

    let count = 0;
    let scanned = 0;
    let atLeast = false;

    for await (const signup of ctx.db.query("waitlistSignups")) {
      if (scanned >= LEGACY_COUNT_SCAN_LIMIT) {
        atLeast = true;
        break;
      }
      scanned += 1;

      const state = signup.launchEmailState;
      if (state === "sent" || state === "sending") continue;
      if (state === "failed" || state === "unconfirmed") continue;
      // Opted-out recipients are never sent to, so they are not part of the
      // count the panel warns about.
      if (state === "unsubscribed") continue;
      if (signup.unsubscribedAt !== undefined) continue;
      if (
        (signup.launchEmailAttempts ?? 0) >= LAUNCH_EMAIL_MAX_ATTEMPTS
      ) {
        continue;
      }
      count += 1;
    }

    return { count, atLeast };
  },
});

// Unconfirmed recipients for the panel. Capped server-side; the total comes
// from the maintained counter so it is not a page length.
export const listUnconfirmedLaunchEmailRecipients = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    const progress = await ctx.db.query("launchEmailProgress").first();
    const now = Date.now();

    const unconfirmed = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) =>
        q.eq("launchEmailState", "unconfirmed"),
      )
      .order("desc")
      .take(limit);

    // A stale "sending" row is counted as unconfirmed by the status query, so
    // it has to appear here too: otherwise the panel says "N unconfirmed" and
    // offers to requeue all of them, but the list is empty and the requeue
    // finds nothing.
    const sending = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_launchEmailState", (q) =>
        q.eq("launchEmailState", "sending"),
      )
      .order("desc")
      .take(limit);
    const staleSending = sending.filter(
      (signup) =>
        !isLaunchEmailSendingLive(signup, progress, now) &&
        // Opted-out leftovers are Unsubscribed, not Unconfirmed.
        signup.unsubscribedAt === undefined,
    );

    const entries = [
      ...unconfirmed.map((signup) => ({
        _id: signup._id,
        email: signup.email,
        error: signup.launchEmailError ?? null,
        createdAt: signup._creationTime,
        unsubscribed: signup.unsubscribedAt !== undefined,
      })),
      ...staleSending.map((signup) => ({
        _id: signup._id,
        email: signup.email,
        error: signup.launchEmailError || "Delivery was not confirmed",
        createdAt: signup._creationTime,
        unsubscribed: signup.unsubscribedAt !== undefined,
      })),
    ]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    const totalBase =
      progress?.unconfirmed ??
      (await countLaunchEmailState(ctx, "unconfirmed"));

    return {
      recipients: entries.map(
        ({ createdAt: _createdAt, ...entry }) => entry,
      ),
      total: totalBase + staleSending.length,
      limit,
    };
  },
});

// Gives rows that failed every attempt a fresh set so a fixed cause can be
// retried. Admin-checked and confirmed in the panel.
export const clearExhaustedLaunchEmailAttempts = mutation({
  args: {},
  handler: async (ctx): Promise<{ cleared: number }> => {
    await assertAdmin(ctx);

    const progress = await ctx.db.query("launchEmailProgress").first();
    if ((progress?.leaseUntil ?? 0) > Date.now()) {
      throw new ConvexError(
        "A launch email batch is currently running. Wait for it to stop and try again.",
      );
    }

    return await ctx.runMutation(
      internal.launchHelpers.clearExhaustedLaunchEmailAttempts,
      {},
    );
  },
});

// Deliberate, admin-only requeue of one or all `unconfirmed` recipients. This
// can send a second copy to someone who already received the mail, so it is
// never automatic and the panel explains the risk before calling it.
export const requeueUnconfirmedLaunchEmails = mutation({
  args: {
    signupId: v.optional(v.id("waitlistSignups")),
    all: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ requeued: number }> => {
    await assertAdmin(ctx);

    const progress = await ctx.db.query("launchEmailProgress").first();
    if ((progress?.leaseUntil ?? 0) > Date.now()) {
      throw new ConvexError(
        "A launch email batch is currently running. Wait for it to stop and try again.",
      );
    }

    if (args.signupId) {
      const signup = await ctx.db.get(args.signupId);
      if (!signup) {
        throw new ConvexError("That recipient is not in the unconfirmed state.");
      }

      if (signup.unsubscribedAt !== undefined) {
        // Settle the row before refusing: a stale unconfirmed/sending row that
        // opted out must not stay visible as something that can be requeued.
        if (
          signup.launchEmailState !== "sent" &&
          signup.launchEmailState !== "unsubscribed"
        ) {
          const wasUnconfirmed =
            signup.launchEmailState === "unconfirmed";
          await ctx.db.patch(signup._id, {
            launchEmailState: "unsubscribed",
            launchEmailSentAt: null,
            launchEmailError: null,
            launchEmailLeaseUntil: null,
            launchEmailRunId: null,
          });
          if (progress) {
            await ctx.db.patch(progress._id, {
              unconfirmed: wasUnconfirmed
                ? Math.max(0, (progress.unconfirmed ?? 0) - 1)
                : progress.unconfirmed,
              unsubscribed: (progress.unsubscribed ?? 0) + 1,
            });
          }
        }

        throw new ConvexError(
          "That recipient unsubscribed and will not be emailed again.",
        );
      }

      const isUnconfirmed = signup.launchEmailState === "unconfirmed";
      // A "sending" row whose run is dead is already counted as unconfirmed by
      // the status query and shown in the list, so requeueing it must work too.
      const isStaleSending =
        signup.launchEmailState === "sending" &&
        !isLaunchEmailSendingLive(signup, progress, Date.now());

      if (!isUnconfirmed && !isStaleSending) {
        throw new ConvexError(
          "That recipient is not in the unconfirmed state.",
        );
      }

      await ctx.db.patch(signup._id, {
        launchEmailState: "pending",
        launchEmailSentAt: null,
        launchEmailError: null,
        launchEmailAttempts: 0,
        launchEmailLeaseUntil: null,
        launchEmailRunId: null,
      });

      if (progress) {
        // The row already moved to pending, so the index count is the exact
        // remainder when no counter existed. A stale "sending" row was only
        // part of the displayed count, never of the counter, so it must not
        // decrement the counter.
        const nextUnconfirmed =
          progress.unconfirmed === undefined
            ? await countLaunchEmailState(ctx, "unconfirmed")
            : Math.max(0, progress.unconfirmed - (isUnconfirmed ? 1 : 0));
        await ctx.db.patch(progress._id, {
          unconfirmed: nextUnconfirmed,
          done: false,
          cursor: null,
          finishedAt: null,
          lastError: null,
        });
      }

      return { requeued: 1 };
    }

    if (!args.all) {
      throw new ConvexError("Choose one unconfirmed recipient or all of them.");
    }

    return await ctx.runMutation(
      internal.launchHelpers.requeueUnconfirmedBatch,
      {},
    );
  },
});
