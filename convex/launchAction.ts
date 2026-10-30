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

// Stop the batch after this many failures in a row, whatever the class. A run
// must never report "done" while a large fraction failed because of an outage,
// even if the individual errors did not look provider-wide.
const LAUNCH_EMAIL_MAX_CONSECUTIVE_FAILURES = 5;

type LaunchEmailRecipient = { _id: Id<"waitlistSignups">; email: string };

type LaunchEmailBatchResult = {
  sent: number;
  failed: number;
  unconfirmed: number;
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
    let unconfirmed = 0;
    let skipped = 0;
    // Set when the provider itself refused the request (bad key, no access,
    // an outage, a rate limit), so every other recipient would fail the same
    // way.
    let providerError: string | null = null;
    // The recipient whose send produced the provider-wide error. Its attempt
    // is rolled back on abort: an outage or a bad key is not its fault.
    let providerWideSignupId: Id<"waitlistSignups"> | null = null;
    let consecutiveFailures = 0;
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
            consecutiveFailures = 0;
          } else {
            consecutiveFailures += 1;
            if (result.status === "failed") {
              failed += 1;
            } else {
              unconfirmed += 1;
            }
            if (result.providerWide) {
              providerError = result.errorMessage ?? providerError;
              providerWideSignupId = recipient._id;
            }
          }

          // Do not keep hammering the provider once the cause is known to be
          // wider than this recipient.
          if (
            providerError !== null ||
            consecutiveFailures >= LAUNCH_EMAIL_MAX_CONSECUTIVE_FAILURES
          ) {
            break;
          }
        } catch (error) {
          // The action itself failed, so there is no way to know whether the
          // provider accepted the email. Never mark it retryable: record it as
          // unconfirmed and stop the batch.
          const errorMessage = truncateErrorMessage(error);
          await ctx.runMutation(
            internal.launchHelpers.recordLaunchEmailResult,
            {
              signupId: recipient._id,
              outcome: "unconfirmed",
              errorMessage,
            },
          );
          unconfirmed += 1;
          consecutiveFailures += 1;
          providerError = errorMessage;
          providerWideSignupId = recipient._id;
          break;
        }
      }

      // A provider-wide failure, or a run of failures that looks like one,
      // means the cause has to be fixed first: keep the cursor where it was and
      // put this batch's retryable recipients back in the queue. The run is
      // left paused, never done, so the panel can say so.
      if (
        providerError !== null ||
        consecutiveFailures >= LAUNCH_EMAIL_MAX_CONSECUTIVE_FAILURES
      ) {
        const errorMessage =
          providerError ??
          `${consecutiveFailures} recipients in a row failed; pausing instead of continuing.`;

        await ctx.runMutation(
          internal.launchHelpers.abortLaunchEmailBatch,
          {
            runId,
            mode,
            signupIds: attemptedIds,
            providerWideSignupId,
            errorMessage,
          },
        );
        throw new ConvexError(
          `Launch email paused after ${failed + unconfirmed} failure(s) in this batch: ${errorMessage}`,
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
      unconfirmed,
      skipped,
      isDone,
      runId,
    };
  },
});
