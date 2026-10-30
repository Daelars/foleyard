"use node";

import { createHash } from "node:crypto";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const IP_HASH_SALT = process.env.WAITLIST_IP_HASH_SALT ?? process.env.CONVEX_DEPLOYMENT ?? "foleyard-waitlist";

export const handleDownload = internalAction({
  args: {
    ipAddress: v.string(),
  },
  handler: async (ctx, args) => {
    // Only the hash is stored, so one visitor counts once without keeping
    // their address around.
    const visitorId = createHash("sha256")
      .update(`${IP_HASH_SALT}:${args.ipAddress}`)
      .digest("hex");

    await ctx.runMutation(internal.downloads.recordDownload, { visitorId });

    return null;
  },
});
