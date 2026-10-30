"use node";

import { createHash } from "node:crypto";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  isValidUnsubscribeEmail,
  normalizeUnsubscribeEmail,
} from "./lib/unsubscribe";

const IP_HASH_SALT = process.env.WAITLIST_IP_HASH_SALT ?? process.env.CONVEX_DEPLOYMENT ?? "foleyard-waitlist";

export const handleSubmission = internalAction({
  args: {
    email: v.string(),
    source: v.string(),
    website: v.string(),
    ipAddress: v.string(),
    userAgent: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.website.trim() !== "") {
      return { kind: "accepted" as const };
    }

    // The HTTP schema already rejects this, but the action is the boundary
    // that writes the row: an address the unsubscribe signer cannot sign must
    // never be stored, or the launch send would stall on it.
    const normalizedEmail = normalizeUnsubscribeEmail(args.email);
    if (!isValidUnsubscribeEmail(normalizedEmail)) {
      return { kind: "invalid" as const };
    }

    const ipHash = createHash("sha256")
      .update(`${IP_HASH_SALT}:${args.ipAddress}`)
      .digest("hex");

    await ctx.runMutation(internal.waitlist.recordSignup, {
      email: args.email.trim(),
      normalizedEmail,
      source: args.source,
      ipHash,
      userAgent: args.userAgent.slice(0, 512),
    });

    return { kind: "accepted" as const };
  },
});
