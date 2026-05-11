"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

export function AdminLaunchClient() {
  const launchConfig = useQuery(api.launch.get);
  const setLaunched = useMutation(api.launch.setLaunched);
  const sendLaunchEmails = useAction(api.launchAction.sendLaunchEmails);

  const [toggling, setToggling] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    sent: number;
    failed: number;
    total: number;
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

  const handleSendEmails = async () => {
    if (sending) return;
    setSending(true);
    setSendResult(null);
    setSendError(null);
    try {
      const result = await sendLaunchEmails();
      setSendResult(result);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send");
    } finally {
      setSending(false);
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
            <div>
              <h2 className="text-2xl font-serif font-bold tracking-tight">
                Launch Email
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Send a launch announcement to everyone on the waitlist.
              </p>
            </div>

            {launchConfig.launchEmailSent ? (
              <div className="p-4 border border-primary/30 bg-primary/10 rounded-sm text-sm font-mono text-primary">
                Launch email has already been sent.
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground font-mono">
                  Uses your existing Resend setup. Each recipient gets an
                  individual email with the download link.
                </p>
                <button
                  onClick={handleSendEmails}
                  disabled={sending}
                  className="px-8 py-3 bg-primary text-primary-foreground font-mono font-bold uppercase tracking-widest rounded-sm hover:scale-[1.02] active:scale-[0.98] transition-all glow-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? "SENDING..." : "Send Launch Email"}
                </button>
              </div>
            )}

            {sendResult && (
              <div className="p-4 border border-border rounded-sm text-sm font-mono space-y-1">
                <p className="text-primary">
                  Sent: {sendResult.sent} / {sendResult.total}
                </p>
                {sendResult.failed > 0 && (
                  <p className="text-destructive">
                    Failed: {sendResult.failed}
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
        </div>
      )}
    </div>
  );
}
