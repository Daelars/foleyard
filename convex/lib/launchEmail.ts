import type { Doc, Id } from "../_generated/dataModel";

// Renewed on every recipient so a slow batch cannot lose the lease.
export const LAUNCH_EMAIL_LEASE_MS = 60 * 1000;

// How many times a recipient may be attempted before it is left alone. Without
// this, permanently failing rows at the front of the queue would be picked for
// every retry and later failures would never be reached.
export const LAUNCH_EMAIL_MAX_ATTEMPTS = 5;

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
  // Why the last batch stopped early (provider error or too many consecutive
  // failures), so the panel can say "paused" instead of "finished".
  lastError: string | null;
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
      lastError: progress.lastError ?? null,
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
    lastError: null,
  };
}

// Errors that mean every remaining send will fail the same way: a missing or
// rejected key, no access, a rate limit, an exhausted quota, or the provider
// itself being unreachable or broken. Any other error belongs to the single
// recipient and must not abort the run.
//
// `statusCode` null covers the Resend SDK's network-failure path, which returns
// `application_error` with no status ("Unable to fetch data. The request could
// not be resolved."), so an outage looks like a normal per-recipient rejection
// unless it is checked here. 5xx covers the SDK's non-JSON gateway response and
// `internal_server_error`.
export function isProviderWideEmailError(error: {
  name?: string | null;
  statusCode?: number | null;
  message?: string | null;
}) {
  const statusCode = error.statusCode ?? null;
  if (statusCode === null || statusCode >= 500) {
    return true;
  }

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
    name === "daily_quota_exceeded" ||
    name === "application_error" ||
    name === "internal_server_error"
  ) {
    return true;
  }

  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("could not be resolved") ||
    message.includes("service unavailable")
  );
}

// True when the request may have reached the provider but no definitive
// rejection came back: the SDK could not reach it (null status), the provider
// returned a 5xx, or an exception escaped after the request was sent. Such an
// attempt must never be retried automatically, because the email may already
// have gone out.
export function isAmbiguousEmailError(error: {
  name?: string | null;
  statusCode?: number | null;
  message?: string | null;
}) {
  const statusCode = error.statusCode ?? null;
  if (statusCode === null || statusCode >= 500) {
    return true;
  }

  const name = error.name ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    name === "application_error" ||
    name === "internal_server_error" ||
    message.includes("could not be resolved") ||
    message.includes("service unavailable") ||
    message.includes("timeout") ||
    message.includes("timed out")
  );
}
