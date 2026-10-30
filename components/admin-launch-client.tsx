"use client";

import { useEffect, useState } from "react";
import {
  useConvex,
  useConvexAuth,
  useQuery,
  useMutation,
  useAction,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type BusyState = "send" | "retry" | "reset" | "requeue" | "clear" | null;

const UNCONFIRMED_PAGE_SIZE = 50;

export function AdminLaunchClient() {
  // Admin queries throw until Clerk's token reaches Convex, so the panel must
  // not subscribe to them before the client is authenticated.
  const { isAuthenticated } = useConvexAuth();
  const convex = useConvex();
  const launchConfig = useQuery(api.launch.get);
  const launchEmail = useQuery(
    api.launch.getLaunchEmailStatus,
    isAuthenticated ? {} : "skip",
  );
  const unconfirmedRecipients = useQuery(
    api.launch.listUnconfirmedLaunchEmailRecipients,
    isAuthenticated && (launchEmail?.unconfirmed ?? 0) > 0
      ? { limit: UNCONFIRMED_PAGE_SIZE }
      : "skip",
  );
  const downloadCount = useQuery(api.downloads.getCount);
  const setLaunched = useMutation(api.launch.setLaunched);
  const resetLaunchEmailClaim = useMutation(
    api.launch.resetLaunchEmailClaim,
  );
  const clearExhausted = useMutation(
    api.launch.clearExhaustedLaunchEmailAttempts,
  );
  const requeueUnconfirmed = useMutation(
    api.launch.requeueUnconfirmedLaunchEmails,
  );
  const sendLaunchEmails = useAction(api.launchAction.sendLaunchEmails);

  const [toggling, setToggling] = useState(false);
  const [busy, setBusy] = useState<BusyState>(null);
  const [runResult, setRunResult] = useState<{
    sent: number;
    failed: number;
    unconfirmed: number;
  } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loopNotice, setLoopNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Count down the lease a closed tab still holds, so the operator knows why
  // Resume answers "already running" for a while.
  useEffect(() => {
    if (!launchEmail?.running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [launchEmail?.running]);

  const resumeInSeconds =
    launchEmail?.running && launchEmail.leaseUntil
      ? Math.max(0, Math.ceil((launchEmail.leaseUntil - now) / 1000))
      : 0;

  const handleToggle = async (launched: boolean) => {
    if (toggling) return;
    setToggling(true);
    try {
      await setLaunched({ launched });
    } catch (error) {
      console.error(error);
    } finally {
      setToggling(false);
    }
  };

  const handleSend = async (mode: "send" | "retry") => {
    if (busy) return;

    try {
      if (mode === "send") {
        const { count, atLeast } =
          await convex.query(api.launch.getLaunchEmailRecipientCount, {});
        const recipientCount = `${atLeast ? "at least " : ""}${count}`;
        const confirmed = window.confirm(
          launchEmail?.claimed
            ? `Resume the launch email to ${recipientCount} recipient(s) who have not received it yet? Recipients already sent, failed or unconfirmed are skipped.`
            : `Send the launch email to ${recipientCount} recipient(s)? This emails the remaining waitlist and cannot be undone.`,
        );
        if (!confirmed) return;
      } else {
        const confirmed = window.confirm(
          `Retry ${launchEmail?.retryableFailed ?? 0} recipient(s) whose send definitively failed? Only failures are retried.`,
        );
        if (!confirmed) return;
      }
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "Could not read the recipient count",
      );
      return;
    }

    setBusy(mode);
    setRunResult(null);
    setSendError(null);
    setLoopNotice(null);

    let sent = 0;
    let failed = 0;
    let unconfirmed = 0;
    let runId: string | undefined;

    try {
      let done = false;
      let rounds = 0;

      // Each action call is one bounded batch. Keep calling it until the list
      // is done; if this tab closes, the stored cursor resumes from here.
      while (!done && rounds < 200) {
        rounds += 1;
        const result = await sendLaunchEmails({ mode, runId });
        runId = result.runId;
        sent += result.sent;
        failed += result.failed;
        unconfirmed += result.unconfirmed;
        setRunResult({ sent, failed, unconfirmed });
        done = result.isDone;

        // Stop after a retry batch that still has failures, so a broken
        // recipient cannot make the loop hammer the provider.
        if (mode === "retry" && result.failed > 0) done = true;
      }

      // Never stop silently: the server keeps the cursor, so Resume continues.
      if (!done) {
        setLoopNotice(
          "Paused after 200 batches in this tab. Click Resume to continue where it stopped.",
        );
      }
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send");
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async () => {
    if (busy) return;

    const confirmed = window.confirm(
      "Reset the launch email claim? Only do this when no emails have been sent yet.",
    );
    if (!confirmed) return;

    setBusy("reset");
    setSendError(null);
    setRunResult(null);
    setLoopNotice(null);
    try {
      await resetLaunchEmailClaim({});
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to reset");
    } finally {
      setBusy(null);
    }
  };

  const handleRequeueOne = async (
    signupId: Id<"waitlistSignups">,
    email: string,
  ) => {
    if (busy) return;

    const confirmed = window.confirm(
      `Requeue ${email}?\n\nThis recipient is unconfirmed: the email may already have arrived. Requeuing can send a SECOND copy. Only do this if you are sure it did not arrive.`,
    );
    if (!confirmed) return;

    setBusy("requeue");
    setSendError(null);
    try {
      await requeueUnconfirmed({ signupId });
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Failed to requeue",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleRequeueAll = async (total: number) => {
    if (busy) return;

    const confirmed = window.confirm(
      `Requeue all ${total} unconfirmed recipient(s)?\n\nTheir email may already have arrived, so this can send a SECOND copy to each of them. Only do this if you are sure they did not receive it.`,
    );
    if (!confirmed) return;

    setBusy("requeue");
    setSendError(null);
    try {
      await requeueUnconfirmed({ all: true });
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Failed to requeue",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleClearExhausted = async (total: number) => {
    if (busy) return;

    const confirmed = window.confirm(
      `Give ${total} recipient(s) that failed every attempt a fresh set of attempts? They stay failed until you run "Retry Failed".`,
    );
    if (!confirmed) return;

    setBusy("clear");
    setSendError(null);
    try {
      await clearExhausted({});
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Failed to clear attempts",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-12 animate-reveal">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-12 h-px bg-primary" />
          <span className="font-mono text-xs text-primary font-bold uppercase tracking-[0.2em]">
            Launch Control
          </span>
        </div>
        <h1 className="text-4xl md:text-6xl font-serif font-bold tracking-tighter">
          Launch <span className="text-primary italic">Panel.</span>
        </h1>
      </header>

      {launchConfig === undefined ? (
        <div className="animate-pulse font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Loading...
        </div>
      ) : (
        <div className="space-y-8">
          <div className="p-8 bg-card/50 backdrop-blur-sm border border-border/50 rounded-sm corner-tick corner-tick-tr corner-tick-bl shadow-xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-serif font-bold tracking-tight">
                  Site Status
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {launchConfig.launched
                    ? "The download button is live on the landing page."
                    : "Visitors still see the waitlist form."}
                </p>
              </div>
              <span
                className={`px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest rounded-full ${
                  launchConfig.launched
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-muted/50 text-muted-foreground border border-border"
                }`}
              >
                {launchConfig.launched ? "LIVE" : "WAITLIST"}
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleToggle(true)}
                disabled={launchConfig.launched || toggling}
                className="px-8 py-3 bg-primary text-primary-foreground font-mono font-bold uppercase tracking-widest rounded-sm hover:scale-[1.02] active:scale-[0.98] transition-all glow-primary disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                Go Live
              </button>
              <button
                onClick={() => handleToggle(false)}
                disabled={!launchConfig.launched || toggling}
                className="px-8 py-3 border border-border font-mono font-bold uppercase tracking-widest text-muted-foreground rounded-sm hover:border-destructive hover:text-destructive transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted-foreground"
              >
                Revert to Waitlist
              </button>
            </div>

            {launchConfig.launchedAt && launchConfig.launched && (
              <div className="text-sm text-muted-foreground font-mono">
                Live since{" "}
                {new Date(launchConfig.launchedAt).toLocaleString()}
              </div>
            )}
          </div>

          <div className="p-8 bg-card/50 backdrop-blur-sm border border-border/50 rounded-sm corner-tick corner-tick-tr corner-tick-bl shadow-xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-serif font-bold tracking-tight">
                  Downloads
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Total downloads recorded since going live.
                </p>
              </div>
              <span className="text-3xl font-serif font-bold tracking-tight text-primary">
                {downloadCount ?? "—"}
              </span>
            </div>
          </div>

          <div className="p-8 bg-card/50 backdrop-blur-sm border border-border/50 rounded-sm corner-tick corner-tick-tr corner-tick-bl shadow-xl space-y-6">
            <div>
              <h2 className="text-2xl font-serif font-bold tracking-tight">
                Launch Email
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Send a launch announcement to everyone on the waitlist, in
                batches you can pause and resume.
              </p>
            </div>

            {launchEmail === undefined ? (
              <div className="animate-pulse font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Loading...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border border-border rounded-sm">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Sent
                    </p>
                    <p className="mt-1 text-2xl font-serif font-bold tracking-tight text-primary">
                      {launchEmail.sent}
                    </p>
                  </div>
                  <div className="p-4 border border-border rounded-sm">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Failed
                    </p>
                    <p
                      className={`mt-1 text-2xl font-serif font-bold tracking-tight ${
                        launchEmail.failed > 0
                          ? "text-destructive"
                          : "text-foreground"
                      }`}
                    >
                      {launchEmail.failed}
                    </p>
                  </div>
                </div>

                {launchEmail.legacy ? (
                  <div className="p-4 border border-primary/30 bg-primary/10 rounded-sm text-sm font-mono text-primary">
                    This deployment sent the launch email before batched
                    sending existed, so there is no per-recipient record to
                    resume. It is treated as finished and cannot be resumed or
                    reset.
                  </div>
                ) : launchEmail.pausedError ? (
                  // Checked before `done`: a retry that pauses after a
                  // finished send must never render as "finished".
                  <div className="p-4 border border-destructive/30 bg-destructive/10 rounded-sm text-sm font-mono text-destructive">
                    Paused: {launchEmail.pausedError}
                    {launchEmail.done
                      ? " Fix the cause, then retry the failed recipients."
                      : " Resume to continue from the last batch."}
                  </div>
                ) : launchEmail.done ? (
                  <div className="p-4 border border-primary/30 bg-primary/10 rounded-sm text-sm font-mono text-primary">
                    Launch email finished
                    {launchEmail.finishedAt
                      ? ` on ${new Date(
                          launchEmail.finishedAt,
                        ).toLocaleString()}`
                      : ""}
                    .
                  </div>
                ) : launchEmail.claimed ? (
                  <div className="p-4 border border-border rounded-sm text-sm font-mono text-muted-foreground">
                    {launchEmail.running
                      ? resumeInSeconds > 0
                        ? `A batch is in progress. If it was a closed tab, you can resume in ${resumeInSeconds}s.`
                        : "A batch is in progress. If it stopped, resume to continue."
                      : "Paused — resume to continue from the last batch."}
                  </div>
                ) : null}

                {launchEmail.unconfirmed > 0 && (
                  <div className="p-4 border border-destructive/30 bg-destructive/10 rounded-sm text-sm font-mono text-destructive space-y-3">
                    <p>
                      {launchEmail.unconfirmed} recipient
                      {launchEmail.unconfirmed === 1 ? "" : "s"} unconfirmed:
                      delivery could not be recorded. They are never retried
                      automatically, because that could send a second copy.
                    </p>

                    {unconfirmedRecipients &&
                      unconfirmedRecipients.recipients.length > 0 && (
                        <div className="space-y-2">
                          <ul className="max-h-64 overflow-y-auto divide-y divide-destructive/20 border border-destructive/20 rounded-sm">
                            {unconfirmedRecipients.recipients.map(
                              (recipient) => (
                                <li
                                  key={recipient._id}
                                  className="flex items-center justify-between gap-3 px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-foreground">
                                      {recipient.email}
                                    </p>
                                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                      unconfirmed
                                      {recipient.error
                                        ? ` — ${recipient.error}`
                                        : ""}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() =>
                                      handleRequeueOne(
                                        recipient._id,
                                        recipient.email,
                                      )
                                    }
                                    disabled={busy !== null}
                                    className="shrink-0 px-3 py-1 border border-destructive/40 font-mono text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-destructive/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Requeue
                                  </button>
                                </li>
                              ),
                            )}
                          </ul>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            Showing {unconfirmedRecipients.recipients.length} of{" "}
                            {unconfirmedRecipients.total}. Requeueing reopens
                            the run; use Resume Sending afterwards.
                          </p>
                        </div>
                      )}

                    <button
                      onClick={() => handleRequeueAll(launchEmail.unconfirmed)}
                      disabled={busy !== null}
                      className="px-4 py-2 border border-destructive/40 font-mono text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-destructive/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {busy === "requeue"
                        ? "REQUEUEING..."
                        : `Requeue all unconfirmed (${launchEmail.unconfirmed})`}
                    </button>
                  </div>
                )}

                {launchEmail.exhaustedFailed > 0 && (
                  <div className="p-4 border border-border rounded-sm text-sm font-mono text-muted-foreground space-y-3">
                    <p>
                      {launchEmail.exhaustedFailed} recipient
                      {launchEmail.exhaustedFailed === 1 ? "" : "s"} failed
                      every attempt and will not be retried, so they cannot
                      block the rest of the list.
                    </p>
                    <button
                      onClick={() =>
                        handleClearExhausted(launchEmail.exhaustedFailed)
                      }
                      disabled={busy !== null}
                      className="px-4 py-2 border border-border font-mono text-[10px] font-bold uppercase tracking-widest rounded-sm hover:border-primary hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {busy === "clear"
                        ? "CLEARING..."
                        : `Clear exhausted attempts (${launchEmail.exhaustedFailed})`}
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  {!launchEmail.done && (
                    <button
                      onClick={() => handleSend("send")}
                      disabled={busy !== null}
                      className="px-8 py-3 bg-primary text-primary-foreground font-mono font-bold uppercase tracking-widest rounded-sm hover:scale-[1.02] active:scale-[0.98] transition-all glow-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      {busy === "send"
                        ? "SENDING..."
                        : launchEmail.claimed
                          ? "Resume Sending"
                          : "Send Launch Email"}
                    </button>
                  )}

                  {launchEmail.retryableFailed > 0 && (
                    <button
                      onClick={() => handleSend("retry")}
                      disabled={busy !== null}
                      className="px-8 py-3 border border-border font-mono font-bold uppercase tracking-widest text-muted-foreground rounded-sm hover:border-primary hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted-foreground"
                    >
                      {busy === "retry"
                        ? "RETRYING..."
                        : `Retry Failed (${launchEmail.retryableFailed})`}
                    </button>
                  )}

                  {launchEmail.claimed &&
                    !launchEmail.done &&
                    launchEmail.sent === 0 && (
                      <button
                        onClick={handleReset}
                        disabled={busy !== null}
                        className="px-8 py-3 border border-border font-mono font-bold uppercase tracking-widest text-muted-foreground rounded-sm hover:border-destructive hover:text-destructive transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted-foreground"
                      >
                        {busy === "reset" ? "RESETTING..." : "Reset Claim"}
                      </button>
                    )}
                </div>

                <p className="text-xs text-muted-foreground font-mono">
                  Sends 25 recipients per batch. Closing this tab is safe:
                  Resume continues from the stored position and skips anyone
                  already sent, failed or unconfirmed. The one exception is a
                  manual requeue: requeueing an unconfirmed recipient can send a
                  second copy, which is why it is confirmed and never automatic.
                  Reset is only for a claim that stopped before sending
                  anything.
                </p>

                {(loopNotice || sendError) && (
                  <div className="space-y-2">
                    {loopNotice && (
                      <div className="p-4 border border-border rounded-sm text-sm font-mono text-muted-foreground">
                        {loopNotice}
                      </div>
                    )}
                    {sendError && (
                      <div className="p-4 border border-destructive/30 bg-destructive/10 rounded-sm text-sm font-mono text-destructive">
                        {sendError}
                      </div>
                    )}
                  </div>
                )}

                {runResult && (
                  <div className="p-4 border border-border rounded-sm text-sm font-mono space-y-1">
                    <p className="text-primary">
                      Sent this run: {runResult.sent}
                    </p>
                    {runResult.failed > 0 && (
                      <p className="text-destructive">
                        Failed this run: {runResult.failed}
                      </p>
                    )}
                    {runResult.unconfirmed > 0 && (
                      <p className="text-destructive">
                        Unconfirmed this run: {runResult.unconfirmed}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
