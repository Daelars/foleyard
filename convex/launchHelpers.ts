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

// Atomically claims the one-time launch send so concurrent runs cannot both proceed.
export const claimLaunchEmail = internalMutation({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("launchConfig").first();
    if (!config) {
      await ctx.db.insert("launchConfig", {
        launched: false,
        launchEmailSent: true,
        launchedAt: null,
      });
      return true;
    }
    if (config.launchEmailSent) return false;
    await ctx.db.patch(config._id, { launchEmailSent: true });
    return true;
  },
});

export const releaseLaunchEmail = internalMutation({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("launchConfig").first();
    if (config) {
      await ctx.db.patch(config._id, { launchEmailSent: false });
    }
  },
});
