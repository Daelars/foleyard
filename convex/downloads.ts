import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const record = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.db.insert("downloads", { timestamp: Date.now() });
  },
});

export const getCount = query({
  args: {},
  handler: async (ctx) => {
    const downloads = await ctx.db.query("downloads").collect();
    return downloads.length;
  },
});
