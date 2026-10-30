import { v } from "convex/values";
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
