import { ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertAdmin } from "./lib/admin";

export const sendLaunchEmails = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ sent: number; failed: number; total: number }> => {
    await assertAdmin(ctx);

    const claimed: boolean = await ctx.runMutation(
      internal.launchHelpers.claimLaunchEmail,
    );
    if (!claimed) {
      throw new ConvexError("Launch email has already been sent");
    }

    let signups;
    try {
      signups = await ctx.runQuery(
        internal.launchHelpers.getAllSignupsForEmail,
      );
    } catch (error) {
      await ctx.runMutation(internal.launchHelpers.releaseLaunchEmail);
      throw error;
    }

    let sent = 0;
    let failed = 0;

    for (const signup of signups) {
      try {
        const ok: boolean = await ctx.runAction(
          internal.launchEmail.sendLaunchEmailToSignup,
          { email: signup.email, signupId: signup._id },
        );
        if (ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }

    // Kept claimed on partial failure so a re-run cannot double-send; released
    // only when nothing went out so the admin can retry after fixing the cause.
    if (sent === 0 && failed > 0) {
      await ctx.runMutation(internal.launchHelpers.releaseLaunchEmail);
    }

    return { sent, failed, total: signups.length };
  },
});
