"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

type BusyState = "send" | "retry" | "reset" | null;

export function AdminLaunchClient() {
  const launchConfig = useQuery(api.launch.get);
  const launchEmail = useQuery(api.launch.getLaunchEmailStatus);
  const downloadCount = useQuery(api.downloads.getCount);
  const setLaunched = useMutation(api.launch.setLaunched);
  const resetLaunchEmailClaim = useMutation(
    api.launch.resetLaunchEmailClaim,
  );
  const sendLaunchEmails = useAction(api.launchAction.sendLaunchEmails);

  const [toggling, setToggling] = useState(false);
  const [busy, setBusy] = useState<BusyState>(null);
  const [runResult, setRunResult] = useState<{
    sent: number;
    failed: number;
  } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

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
    setBusy(mode);
    setRunResult(null);
    setSendError(null);

    let sent = 0;
    let failed = 0;
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
        setRunResult({ sent, failed });
        done = result.isDone;

        // Stop after a retry batch that still has failures, so a broken
        // recipient cannot make the loop hammer the provider.
        if (mode === "retry" && result.failed > 0) done = true;
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
    try {
      await resetLaunchEmailClaim({});
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to reset");
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

                {launchEmail.done ? (
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
                      ? "A batch is in progress. If it stopped, resume to continue."
                      : "Paused — resume to continue from the last batch."}
                  </div>
                ) : null}

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

                  {launchEmail.failed > 0 && (
                    <button
                      onClick={() => handleSend("retry")}
                      disabled={busy !== null}
                      className="px-8 py-3 border border-border font-mono font-bold uppercase tracking-widest text-muted-foreground rounded-sm hover:border-primary hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted-foreground"
                    >
                      {busy === "retry"
                        ? "RETRYING..."
                        : `Retry Failed (${launchEmail.failed})`}
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
                  resuming never emails the same person twice. Reset is only
                  for a claim that stopped before sending anything.
                </p>

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
                  </div>
                )}

                {sendError && (
                  <div className="p-4 border border-destructive/30 bg-destructive/10 rounded-sm text-sm font-mono text-destructive">
                    {sendError}
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
