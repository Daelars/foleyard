import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { assertAdmin } from "./lib/admin";

// One action invocation handles at most one batch so a long waitlist cannot
// run into the action time limit. The admin panel calls the action again to
// continue where the last batch stopped.
const LAUNCH_EMAIL_BATCH_SIZE = 25;

// Bound how many pages a single batch may scan to find unsent recipients.
const LAUNCH_EMAIL_MAX_PAGES_PER_BATCH = 10;

type LaunchEmailRecipient = { _id: Id<"waitlistSignups">; email: string };

type LaunchEmailBatchResult = {
  sent: number;
  failed: number;
  skipped: number;
  isDone: boolean;
  runId: string;
};

function truncateErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return "Unknown email delivery error";
}

// Sends at most one batch per invocation so a long waitlist never runs into
// the action time limit. Calling it again resumes from the stored cursor, and
// per-recipient state stops anyone from being emailed twice.
export const sendLaunchEmails = action({
  args: {
    mode: v.optional(v.union(v.literal("send"), v.literal("retry"))),
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<LaunchEmailBatchResult> => {
    await assertAdmin(ctx);

    const mode = args.mode ?? "send";
    const runId =
      args.runId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const claim = await ctx.runMutation(
      internal.launchHelpers.claimLaunchEmail,
      { mode, runId },
    );

    if (!claim.started) {
      if (claim.reason === "done") {
        throw new ConvexError("Launch email has already been sent.");
      }
      if (claim.reason === "running") {
        throw new ConvexError(
          "A launch email batch is already running. Wait for it to finish and try again.",
        );
      }
      throw new ConvexError("Start the launch email before retrying failures.");
    }

    const recipients: LaunchEmailRecipient[] = [];
    let cursor = claim.cursor;
    let isDone = false;

    if (mode === "retry") {
      const failed = await ctx.runQuery(
        internal.launchHelpers.getFailedLaunchEmailBatch,
        { limit: LAUNCH_EMAIL_BATCH_SIZE },
      );
      recipients.push(...failed.recipients);
      isDone = failed.recipients.length === 0;
    } else {
      for (
        let page = 0;
        page < LAUNCH_EMAIL_MAX_PAGES_PER_BATCH &&
        recipients.length < LAUNCH_EMAIL_BATCH_SIZE;
        page += 1
      ) {
        const batch = await ctx.runQuery(
          internal.launchHelpers.getLaunchEmailBatch,
          {
            cursor,
            limit: LAUNCH_EMAIL_BATCH_SIZE - recipients.length,
          },
        );

        recipients.push(...batch.recipients);
        cursor = batch.cursor;
        isDone = batch.isDone;

        if (isDone) break;
      }
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    // Set when the provider itself refused the request (bad key, no access,
    // rate limit), so every other recipient would fail the same way.
    let providerError: string | null = null;
    const attemptedIds: Id<"waitlistSignups">[] = [];

    try {
      for (const recipient of recipients) {
        const attempt = await ctx.runMutation(
          internal.launchHelpers.beginLaunchEmailAttempt,
          { signupId: recipient._id, runId },
        );

        if (!attempt.started) {
          if (attempt.reason === "stale_run") break;
          skipped += 1;
          continue;
        }

        attemptedIds.push(recipient._id);

        try {
          const result = await ctx.runAction(
            internal.launchEmail.sendLaunchEmailToSignup,
            { email: recipient.email, signupId: recipient._id },
          );

          if (result.status === "sent") {
            sent += 1;
          } else {
            failed += 1;
            if (result.providerWide) {
              providerError = result.errorMessage ?? providerError;
            }
          }
        } catch (error) {
          const errorMessage = truncateErrorMessage(error);
          await ctx.runMutation(
            internal.launchHelpers.recordLaunchEmailResult,
            {
              signupId: recipient._id,
              outcome: "failed",
              errorMessage,
            },
          );
          failed += 1;
        }
      }

      // A provider-wide failure that delivered nothing means the cause has to
      // be fixed first: keep the cursor where it was and put this batch back in
      // the queue. Per-recipient failures are already recorded, so the cursor
      // advances past them and the run can finish.
      if (mode === "send" && sent === 0 && providerError) {
        await ctx.runMutation(
          internal.launchHelpers.abortLaunchEmailBatch,
          { runId, signupIds: attemptedIds },
        );
        throw new ConvexError(
          `No launch emails were sent in this batch: ${providerError}`,
        );
      }

      if (mode === "retry") {
        await ctx.runMutation(internal.launchHelpers.releaseLaunchEmailLease, {
          runId,
        });
      } else {
        await ctx.runMutation(
          internal.launchHelpers.finishLaunchEmailBatch,
          { runId, cursor, isDone },
        );
      }
    } catch (error) {
      await ctx.runMutation(internal.launchHelpers.releaseLaunchEmailLease, {
        runId,
      });
      throw error;
    }

    return {
      sent,
      failed,
      skipped,
      isDone,
      runId,
    };
  },
});
