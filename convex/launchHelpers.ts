import { internalQuery, internalMutation } from "./_generated/server";

export const getAllSignupsForEmail = internalQuery({
  args: {},
  handler: async (ctx) => {
    const signups = await ctx.db.query("waitlistSignups").collect();
    return signups.map((s) => ({
      _id: s._id,
      email: s.email,
    }));
  },
});

export const markLaunchEmailSent = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("launchConfig").first();
    if (existing) {
      await ctx.db.patch(existing._id, { launchEmailSent: true });
    }
  },
});
