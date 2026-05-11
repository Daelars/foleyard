import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { internal } from "./_generated/api";

function hasAdminRole(identity: { [key: string]: unknown } | null) {
  if (!identity) return false;
  const metadata = identity?.metadata as { role?: unknown } | undefined;
  const publicMetadata = identity?.publicMetadata as
    | { role?: unknown }
    | undefined;
  const publicMetadataSnake = identity?.public_metadata as
    | { role?: unknown }
    | undefined;
  return (
    identity?.role === "admin" ||
    metadata?.role === "admin" ||
    publicMetadata?.role === "admin" ||
    publicMetadataSnake?.role === "admin"
  );
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !hasAdminRole(identity)) {
      throw new Error("Unauthorized");
    }

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
