import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Renewed on every recipient so a slow batch cannot lose the lease.
export const LAUNCH_EMAIL_LEASE_MS = 60 * 1000;

// How many rows a fallback count of opted-out recipients reads. The counter on
// the progress row is authoritative once it exists; this only seeds it.
export const UNSUBSCRIBED_SCAN_LIMIT = 10_000;

// Counts waitlist recipients that opted out. There is no index on "field is
// set", and this only runs when a progress row has no counter yet, so a bounded
// scan is acceptable.
//
// "Unsubscribed" is a disjoint bucket from "Sent": a delivered email that is
// later opted out stays in Sent only, and an opt-out inherited from the other
// list is counted here because that row is never sent. A row that is still
// "sending" is likewise not counted yet; its attempt settles to Sent or
// Unsubscribed when its result is recorded.
export async function countUnsubscribedWaitlistRows(ctx: {
  db: QueryCtx["db"];
}) {
  let count = 0;
  let scanned = 0;
  for await (const row of ctx.db.query("waitlistSignups")) {
    scanned += 1;
    if (
      row.unsubscribedAt !== undefined &&
      row.launchEmailState !== "sent" &&
      row.launchEmailState !== "sending"
    ) {
      count += 1;
    }
    if (scanned >= UNSUBSCRIBED_SCAN_LIMIT) break;
  }
  return count;
}

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
  // Exact denominators for the panel. `exhaustedFailed` is the subset of
  // `failed` that used up its attempts. `unconfirmed` counts rows that may
  // have been delivered. `unsubscribed` counts recipients that opted out and
  // are skipped by every send.
  exhaustedFailed: number;
  unconfirmed: number;
  unsubscribed: number;
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
      exhaustedFailed: progress.exhaustedFailed ?? 0,
      unconfirmed: progress.unconfirmed ?? 0,
      unsubscribed: progress.unsubscribed ?? 0,
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
    // Legacy progress documents have no counters; callers rebuild them from
    // the indexes instead of trusting a zero.
    exhaustedFailed: 0,
    unconfirmed: 0,
    unsubscribed: 0,
  };
}

// True while a "sending" row can still be settled by a live attempt. A row is
// live while its own per-attempt lease is unexpired, or while the run that set
// it still holds the progress lease. Anything else is a leftover whose result
// was never recorded: it must be treated as unconfirmed, never retried, and a
// cleanup must leave a live run's row alone.
export function isLaunchEmailSendingLive(
  row: {
    launchEmailState?: string;
    launchEmailRunId?: string | null;
    launchEmailLeaseUntil?: number | null;
  },
  progress: { runId?: string | null; leaseUntil?: number | null } | null,
  now: number,
) {
  if (row.launchEmailState !== "sending") return false;
  if ((row.launchEmailLeaseUntil ?? 0) > now) return true;

  const runId = progress?.runId ?? null;
  return (
    runId !== null &&
    (row.launchEmailRunId ?? null) === runId &&
    (progress?.leaseUntil ?? 0) > now
  );
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

// A 409 `invalid_idempotent_request` means the provider already saw this
// idempotency key with a different body. It does not tell us whether the first
// request was delivered, so the attempt is ambiguous and must never be retried
// as a definitive failure (that would risk a second accepted copy).
export function isIdempotencyConflictEmailError(error: {
  name?: string | null;
  statusCode?: number | null;
  message?: string | null;
}) {
  if ((error.statusCode ?? null) === 409) return true;

  const name = (error.name ?? "").toLowerCase();
  if (name === "invalid_idempotent_request") return true;

  const message = (error.message ?? "").toLowerCase();
  return message.includes("idempotent") && message.includes("different");
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
