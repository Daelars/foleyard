import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import {
  countUnsubscribedWaitlistRows,
  LAUNCH_EMAIL_MAX_ATTEMPTS,
} from "./lib/launchEmail";
import { verifyUnsubscribeToken } from "./lib/unsubscribe";

// Only failed token verifications consume this limit. A valid signature is
// never throttled: mail providers click links from shared IP ranges, and a
// burst of real opt-outs must not be dropped. Invalid attempts are what a
// script would grind, so they do consume the per-IP bucket.
const UNSUBSCRIBE_IP_WINDOW_MS = 15 * 60 * 1000;
const UNSUBSCRIBE_IP_LIMIT = 20;

// A normalised address should be unique, but historic duplicates are possible;
// opt them all out rather than leaving one behind.
const MATCHING_ROWS_LIMIT = 10;

export type UnsubscribeStatus =
  | "unsubscribed"
  | "invalid"
  | "unavailable"
  | "rate_limited";

async function consumeRateLimit(
  ctx: MutationCtx,
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
        scope: "ip",
        count: 1,
        windowStartedAt: now,
        expiresAt: now + windowMs,
      });
    }
    return true;
  }

  if (existing.count >= limit) return false;

  await ctx.db.patch(existing._id, { count: existing.count + 1 });
  return true;
}

// Checks a token without touching any signup. This is what a GET does: it can
// tell the page whether the link is good, and can never opt anybody out (a link
// scanner following the GET must not unsubscribe someone).
export const checkUnsubscribeToken = internalQuery({
  args: {
    token: v.string(),
    now: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const result = await verifyUnsubscribeToken({
      token: args.token,
      now: args.now ?? Date.now(),
    });

    if (result.ok) {
      return { status: "valid" as const, list: result.list };
    }
    if (result.reason === "unconfigured") {
      return { status: "unavailable" as const };
    }
    return { status: "invalid" as const };
  },
});

type ProgressCounters = {
  failed?: number;
  exhaustedFailed?: number;
  unconfirmed?: number;
};

// Moves one waitlist row out of every send queue. A row that may already have
// been delivered stays in its delivery state (`sent`) so the historical counts
// are untouched; a row that is still queued becomes terminal.
//
// Returns true only when this row newly joins the Unsubscribed bucket. "sent"
// stays in Sent, and "sending" is deferred until its attempt settles, so the
// buckets never overlap.
async function markWaitlistRowUnsubscribed(
  ctx: MutationCtx,
  row: Doc<"waitlistSignups">,
  now: number,
  counters: ProgressCounters,
) {
  const state = row.launchEmailState;

  if (state === "sent" || state === "sending") {
    // "sent" keeps its delivery record. "sending" is a live attempt that cannot
    // be recalled; it settles as Sent or Unsubscribed when its result is
    // recorded, and the opt-out keeps it out of any retry or requeue.
    await ctx.db.patch(row._id, { unsubscribedAt: now });
    return false;
  }

  await ctx.db.patch(row._id, {
    unsubscribedAt: now,
    launchEmailState: "unsubscribed",
    launchEmailSentAt: null,
    launchEmailError: null,
    launchEmailLeaseUntil: null,
    launchEmailRunId: null,
  });

  if (state === "failed") {
    counters.failed = (counters.failed ?? 0) + 1;
    if ((row.launchEmailAttempts ?? 0) >= LAUNCH_EMAIL_MAX_ATTEMPTS) {
      counters.exhaustedFailed = (counters.exhaustedFailed ?? 0) + 1;
    }
  }
  if (state === "unconfirmed") {
    counters.unconfirmed = (counters.unconfirmed ?? 0) + 1;
  }

  return true;
}

// Verifies the token and records the opt-out. The token is the only way in, so
// without a valid signature nothing is written. The response never depends on
// whether the address exists, which keeps the endpoint from being an
// enumeration oracle.
export const unsubscribeWithToken = internalMutation({
  args: {
    token: v.string(),
    // A hash, never the raw address: the same salt as the signup routes, so the
    // rate-limit key cannot be reversed.
    ipHash: v.string(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ status: UnsubscribeStatus }> => {
    const now = args.now ?? Date.now();

    const verified = await verifyUnsubscribeToken({ token: args.token, now });
    if (!verified.ok) {
      // A valid signature is never throttled. Only failed verifications spend
      // the per-IP budget, which is what stops a script grinding tokens.
      const allowed = await consumeRateLimit(
        ctx,
        `unsubscribe-ip:${args.ipHash}`,
        UNSUBSCRIBE_IP_LIMIT,
        UNSUBSCRIBE_IP_WINDOW_MS,
        now,
      );
      if (!allowed) return { status: "rate_limited" };

      return {
        status: verified.reason === "unconfigured" ? "unavailable" : "invalid",
      };
    }

    const counters: ProgressCounters = {};
    let newlyUnsubscribed = 0;

    const waitlistRows = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_normalizedEmail", (q) =>
        q.eq("normalizedEmail", verified.email),
      )
      .take(MATCHING_ROWS_LIMIT);

    for (const row of waitlistRows) {
      if (row.unsubscribedAt !== undefined) continue;
      if (await markWaitlistRowUnsubscribed(ctx, row, now, counters)) {
        newlyUnsubscribed += 1;
      }
    }

    const downloadRows = await ctx.db
      .query("downloadSignups")
      .withIndex("by_normalizedEmail", (q) =>
        q.eq("normalizedEmail", verified.email),
      )
      .take(MATCHING_ROWS_LIMIT);

    for (const row of downloadRows) {
      if (row.unsubscribedAt !== undefined) continue;
      await ctx.db.patch(row._id, { unsubscribedAt: now });
    }

    // Keep the panel's denominators exact. A counter that was never maintained
    // is rebuilt from the rows instead of being incremented from an unknown
    // base.
    const progress = await ctx.db.query("launchEmailProgress").first();
    if (progress) {
      const patch: {
        failed?: number;
        exhaustedFailed?: number;
        unconfirmed?: number;
        unsubscribed?: number;
      } = {};

      if (counters.failed && progress.failed !== undefined) {
        patch.failed = Math.max(0, progress.failed - counters.failed);
      }
      if (counters.exhaustedFailed && progress.exhaustedFailed !== undefined) {
        patch.exhaustedFailed = Math.max(
          0,
          progress.exhaustedFailed - counters.exhaustedFailed,
        );
      }
      if (counters.unconfirmed && progress.unconfirmed !== undefined) {
        patch.unconfirmed = Math.max(
          0,
          progress.unconfirmed - counters.unconfirmed,
        );
      }

      if (progress.unsubscribed === undefined) {
        patch.unsubscribed = await countUnsubscribedWaitlistRows(ctx);
      } else if (newlyUnsubscribed > 0) {
        patch.unsubscribed = progress.unsubscribed + newlyUnsubscribed;
      }

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(progress._id, patch);
      }
    }

    // Same answer whether the address was on a list or not.
    return { status: "unsubscribed" };
  },
});
