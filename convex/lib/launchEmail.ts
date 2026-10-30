import type { Doc, Id } from "../_generated/dataModel";

// Renewed on every recipient so a slow batch cannot lose the lease.
export const LAUNCH_EMAIL_LEASE_MS = 60 * 1000;

export type LaunchEmailProgress = {
  done: boolean;
  cursor: string | null;
  sent: number;
  failed: number;
  startedAt: number | null;
  finishedAt: number | null;
  leaseUntil: number | null;
  runId: string | null;
  inFlightSignupId: Id<"waitlistSignups"> | null;
};

// Deployments that sent the launch email before the batched send existed have
// `launchEmailSent: true` and no `launchEmailDone` field, and no per-recipient
// state. There is no way to know who was reached, so such a deployment must be
// treated as finished: resuming or resetting it would email the whole list
// again. New runs always write `launchEmailDone` on claim, so the missing field
// stays a reliable marker for the old one-shot send.
export function isLegacyLaunchEmailSent(config: Doc<"launchConfig">) {
  return config.launchEmailSent && config.launchEmailDone === undefined;
}

// Reads the send progress. New runs store it in `launchEmailProgress`; a run
// started by the previous batched implementation is read from the legacy
// fields until the next claim migrates it.
export function readLaunchEmailProgress(
  config: Doc<"launchConfig"> | null,
  progress: Doc<"launchEmailProgress"> | null,
): LaunchEmailProgress {
  if (progress) {
    return {
      done: progress.done,
      cursor: progress.cursor ?? null,
      sent: progress.sent,
      failed: progress.failed,
      startedAt: progress.runStartedAt ?? null,
      finishedAt: progress.finishedAt ?? null,
      leaseUntil: progress.leaseUntil ?? null,
      runId: progress.runId ?? null,
      inFlightSignupId: progress.inFlightSignupId ?? null,
    };
  }

  return {
    done: config?.launchEmailDone ?? false,
    cursor: config?.launchEmailCursor ?? null,
    sent: config?.launchEmailSentCount ?? 0,
    failed: config?.launchEmailFailedCount ?? 0,
    startedAt: config?.launchEmailRunStartedAt ?? null,
    finishedAt: config?.launchEmailFinishedAt ?? null,
    leaseUntil: config?.launchEmailLeaseUntil ?? null,
    runId: config?.launchEmailRunId ?? null,
    inFlightSignupId: config?.launchEmailInFlightSignupId ?? null,
  };
}

// Errors that mean every remaining send will fail the same way: a missing or
// rejected key, no access, a rate limit, or an exhausted provider quota. Any
// other error belongs to the single recipient and must not abort the run.
export function isProviderWideEmailError(error: {
  name?: string | null;
  statusCode?: number | null;
  message?: string | null;
}) {
  const statusCode = error.statusCode ?? null;
  if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
    return true;
  }

  const name = error.name ?? "";
  if (
    name === "missing_api_key" ||
    name === "invalid_api_key" ||
    name === "restricted_api_key" ||
    name === "invalid_access" ||
    name === "rate_limit_exceeded" ||
    name === "monthly_quota_exceeded" ||
    name === "daily_quota_exceeded"
  ) {
    return true;
  }

  const message = (error.message ?? "").toLowerCase();
  return message.includes("rate limit") || message.includes("too many requests");
}
