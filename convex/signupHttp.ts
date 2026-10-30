"use node";

import { createHash } from "node:crypto";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { signupKind } from "./signups";

const IP_HASH_SALT = process.env.WAITLIST_IP_HASH_SALT ?? process.env.CONVEX_DEPLOYMENT ?? "foleyard-waitlist";

export const handleSubmission = internalAction({
  args: {
    kind: signupKind,
    email: v.string(),
    website: v.string(),
    ipAddress: v.string(),
    userAgent: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.website.trim() !== "") {
      return { kind: "accepted" as const };
    }

    const normalizedEmail = args.email.trim().toLowerCase();
    const ipHash = createHash("sha256")
      .update(`${IP_HASH_SALT}:${args.ipAddress}`)
      .digest("hex");

    await ctx.runMutation(internal.signups.recordSignup, {
      kind: args.kind,
      email: args.email.trim(),
      normalizedEmail,
      ipHash,
      userAgent: args.userAgent.slice(0, 512),
    });

    return { kind: "accepted" as const };
  },
});
