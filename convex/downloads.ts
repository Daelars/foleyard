import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";

// Downloads from the same visitor inside this window count once. A visitor is
// an IP hash; repeat clicks and the email form are the same download.
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const COUNTER_KEY = "downloads";
const BACKFILL_BATCH_SIZE = 500;

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

    // Downloads recorded before the counter existed. The first new download
    // (or downloads:backfillCount) replaces this one-time scan with a
    // constant-time read.
    let legacyCount = 0;
    for await (const _download of ctx.db.query("downloads")) {
      legacyCount += 1;
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
      return { counted: false as const };
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
    } else {
      // First download since the counter was introduced. Start at one and let
      // the backfill add the downloads that were recorded before it existed.
      await ctx.db.insert("downloadStats", {
        key: COUNTER_KEY,
        count: 1,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.downloads.backfillCount, {});
    }

    return { counted: true as const };
  },
});

// Rebuilds the counter from the download rows. Runs in pages so a large
// history does not exceed the mutation transaction limits.
export const backfillCount = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    total: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("downloads").paginate({
      cursor: args.cursor ?? null,
      numItems: BACKFILL_BATCH_SIZE,
    });
    const total = (args.total ?? 0) + page.page.length;

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.downloads.backfillCount, {
        cursor: page.continueCursor,
        total,
      });
      return null;
    }

    const now = Date.now();
    const counter = await ctx.db
      .query("downloadStats")
      .withIndex("by_key", (q) => q.eq("key", COUNTER_KEY))
      .unique();

    if (counter) {
      // A download can land while the pages are being counted; its increment
      // is already in the counter, so never move the total backwards.
      await ctx.db.patch(counter._id, {
        count: Math.max(counter.count, total),
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("downloadStats", {
        key: COUNTER_KEY,
        count: total,
        updatedAt: now,
      });
    }

    return total;
  },
});
