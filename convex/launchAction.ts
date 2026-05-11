import { action } from "./_generated/server";
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

export const sendLaunchEmails = action({
  args: {},
  handler: async (
    ctx: any,
  ): Promise<{ sent: number; failed: number; total: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !hasAdminRole(identity)) {
      throw new Error("Unauthorized");
    }

    const signups: { _id: string; email: string }[] = await ctx.runQuery(
      internal.launchHelpers.getAllSignupsForEmail,
    );

    let sent = 0;
    let failed = 0;

    for (const signup of signups) {
      try {
        await ctx.runAction(internal.launchEmail.sendLaunchEmailToSignup, {
          email: signup.email,
          signupId: signup._id,
        });
        sent++;
      } catch {
        failed++;
      }
    }

    await ctx.runMutation(internal.launchHelpers.markLaunchEmailSent);

    return { sent, failed, total: signups.length };
  },
});
