"use client";

import { useState } from "react";

import {
  UNSUBSCRIBE_INVALID_MESSAGE,
  UNSUBSCRIBE_RATE_LIMITED_MESSAGE,
  UNSUBSCRIBE_SUCCESS_MESSAGE,
  UNSUBSCRIBE_UNAVAILABLE_MESSAGE,
  unsubscribeResponseSchema,
} from "@/lib/unsubscribe-schema";

type UnsubscribeConfirmProps = {
  token: string;
  email: string | null;
  // "invalid" and "unavailable" come from the server-side check, so a dead
  // link is explained before the button is ever shown.
  initialState: "valid" | "invalid" | "unavailable";
};

type Status = "idle" | "submitting" | "done" | "invalid" | "rate_limited" | "unavailable";

export function UnsubscribeConfirm({
  token,
  email,
  initialState,
}: UnsubscribeConfirmProps) {
  const [status, setStatus] = useState<Status>(
    initialState === "valid" ? "idle" : initialState,
  );

  const handleUnsubscribe = async () => {
    if (status === "submitting" || status === "done") return;
    setStatus("submitting");

    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      });

      const json: unknown = await response.json().catch(() => null);
      const parsed = unsubscribeResponseSchema.safeParse(json);

      if (parsed.success && parsed.data.status === "unsubscribed") {
        setStatus("done");
        return;
      }
      if (parsed.success && parsed.data.status === "rate_limited") {
        setStatus("rate_limited");
        return;
      }
      if (
        parsed.success &&
        parsed.data.status === "unavailable"
      ) {
        setStatus("unavailable");
        return;
      }

      setStatus("invalid");
    } catch {
      setStatus("unavailable");
    }
  };

  if (status === "done") {
    return (
      <div className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
          Done
        </p>
        <h1 className="text-3xl md:text-5xl font-serif font-bold tracking-tighter">
          You&rsquo;re unsubscribed.
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {email ? `${email} will` : "This address will"} not receive any more
          Foleyard emails. Nothing else about your account changes.
        </p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-destructive">
          Link problem
        </p>
        <h1 className="text-3xl md:text-5xl font-serif font-bold tracking-tighter">
          This link is invalid.
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {UNSUBSCRIBE_INVALID_MESSAGE} Use the unsubscribe link in the most
          recent email we sent you, or reply to it and we&rsquo;ll sort it out.
        </p>
      </div>
    );
  }

  if (status === "rate_limited") {
    return (
      <div className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-destructive">
          Slow down
        </p>
        <h1 className="text-3xl md:text-5xl font-serif font-bold tracking-tighter">
          Too many attempts.
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {UNSUBSCRIBE_RATE_LIMITED_MESSAGE}
        </p>
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-destructive">
          Unavailable
        </p>
        <h1 className="text-3xl md:text-5xl font-serif font-bold tracking-tighter">
          Couldn&rsquo;t unsubscribe.
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {UNSUBSCRIBE_UNAVAILABLE_MESSAGE}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
        Email preferences
      </p>
      <h1 className="text-3xl md:text-5xl font-serif font-bold tracking-tighter">
        Unsubscribe from Foleyard emails?
      </h1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {email
          ? `This stops every Foleyard email to ${email}.`
          : "This stops every Foleyard email to the address this link was sent to."}{" "}
        It takes one click, and it can&rsquo;t be undone from here.
      </p>
      <button
        type="button"
        onClick={handleUnsubscribe}
        disabled={status === "submitting"}
        className="px-8 py-3 bg-primary text-primary-foreground font-mono font-bold uppercase tracking-widest rounded-sm hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        {status === "submitting" ? "UNSUBSCRIBING..." : "Confirm unsubscribe"}
      </button>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        Opening this page never unsubscribes you. Only the button does.
      </p>
    </div>
  );
}
