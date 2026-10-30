import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";

// Downloads from the same visitor inside this window count once. A visitor is
// an IP hash; repeat clicks and the email form are the same download.
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const COUNTER_KEY = "downloads";
const BACKFILL_BATCH_SIZE = 500;
// Bounded so the pre-backfill fallback stays cheap even on a large history and
// stays well under the per-function document read limit.
const LEGACY_SCAN_LIMIT = 1000;

export const getCount = query({
  args: {},
  handler: async (ctx) => {
    const counter = await ctx.db
      .query("downloadStats")
      .withIndex("by_key", (q) => q.eq("key", COUNTER_KEY))
      .unique();

    if (counter) {
      return counter.count;
    }

    // The counter only exists once downloads:backfillCount has run. Until then
    // fall back to a capped read: it keeps the admin page working right after
    // deploy and never scans the whole table. Run the backfill straight after
    // deploy and this branch stops being taken.
    let legacyCount = 0;
    for await (const _download of ctx.db.query("downloads")) {
      legacyCount += 1;
      if (legacyCount >= LEGACY_SCAN_LIMIT) {
        break;
      }
    }
    return legacyCount;
  },
});

export const recordDownload = internalMutation({
  args: {
    visitorId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const recent = await ctx.db
      .query("downloads")
      .withIndex("by_visitorId_and_timestamp", (q) =>
        q
          .eq("visitorId", args.visitorId)
          .gte("timestamp", now - DEDUPE_WINDOW_MS),
      )
      .first();

    if (recent) {
      // A repeat from this visitor inside the window: the row is not duplicated.
      return null;
    }

    await ctx.db.insert("downloads", {
      timestamp: now,
      visitorId: args.visitorId,
    });

    const counter = await ctx.db
      .query("downloadStats")
      .withIndex("by_key", (q) => q.eq("key", COUNTER_KEY))
      .unique();

    if (counter) {
      await ctx.db.patch(counter._id, {
        count: counter.count + 1,
        updatedAt: now,
      });
    }

    // With no counter the row is still recorded, but nothing is incremented:
    // a counter created here would hold a partial total until the backfill
    // catches up, and the admin would read a wrong figure in the meantime.
    // downloads:backfillCount counts every row once it runs.
    return null;
  },
});

// Rebuilds the counter from the download rows and creates it if it is missing.
// Runs in pages so a large history does not exceed the mutation transaction
// limits. Re-running it is safe: the counter is only ever moved to the number
// of rows that exist, never backwards.
export const backfillCount = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    counted: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("downloads").paginate({
      cursor: args.cursor ?? null,
      numItems: BACKFILL_BATCH_SIZE,
    });
    const counted = (args.counted ?? 0) + page.page.length;

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.downloads.backfillCount, {
        cursor: page.continueCursor,
        counted,
      });
      return null;
    }

    // Pagination reads forward from the last row it returned and download rows
    // are only ever appended, so a row recorded while the earlier pages ran
    // lands in a later page rather than behind the cursor. Writing the counter
    // in this same transaction closes the remaining gap: a download that
    // commits after this read sees the counter and increments it, one that
    // commits before is already part of `counted`.
    const now = Date.now();
    const counter = await ctx.db
      .query("downloadStats")
      .withIndex("by_key", (q) => q.eq("key", COUNTER_KEY))
      .unique();

    if (counter) {
      // The counter may already carry increments from downloads recorded after
      // an earlier backfill; never move the total backwards.
      await ctx.db.patch(counter._id, {
        count: Math.max(counter.count, counted),
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("downloadStats", {
        key: COUNTER_KEY,
        count: counted,
        updatedAt: now,
      });
    }

    return counted;
  },
});
