import type { Metadata } from "next";
import Link from "next/link";

import { UnsubscribeConfirm } from "@/components/unsubscribe-confirm";
import {
  readUnsubscribeTokenEmail,
  unsubscribeTokenSchema,
} from "@/lib/unsubscribe-schema";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: "Stop Foleyard emails to your address.",
  alternates: { canonical: "/unsubscribe" },
  // A per-recipient link must never be indexed or shared.
  robots: { index: false, follow: false },
};

type InitialState = "valid" | "invalid" | "unavailable";

const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

// Asks Convex whether the token is good. This is a GET, so it cannot record an
// opt-out even if a mail scanner follows the link before the recipient does.
async function checkToken(token: string): Promise<InitialState> {
  if (!convexSiteUrl) return "unavailable";

  try {
    const response = await fetch(
      `${convexSiteUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const json: unknown = await response.json().catch(() => null);
    const status =
      json && typeof json === "object"
        ? (json as { status?: unknown }).status
        : null;

    if (status === "valid") return "valid";
    if (status === "unavailable") return "unavailable";
    return "invalid";
  } catch {
    return "unavailable";
  }
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const parsed = unsubscribeTokenSchema.safeParse(rawToken ?? "");

  let initialState: InitialState = "invalid";
  let email: string | null = null;

  if (parsed.success) {
    email = readUnsubscribeTokenEmail(parsed.data);
    initialState = await checkToken(parsed.data);
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 py-16 selection:bg-primary selection:text-primary-foreground">
      <div className="grain" />
      <div className="fixed inset-0 grid-pattern opacity-20 pointer-events-none" />

      <main className="relative z-10 w-full max-w-xl p-8 md:p-12 bg-card/50 backdrop-blur-sm border border-border/50 rounded-sm corner-tick corner-tick-tr corner-tick-bl shadow-xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 mb-10 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors"
        >
          <span className="w-6 h-6 bg-foreground text-background rounded-sm flex items-center justify-center font-bold text-xs">
            FY
          </span>
          Foleyard
        </Link>

        <UnsubscribeConfirm
          token={parsed.success ? parsed.data : ""}
          email={email}
          initialState={initialState}
        />

        <p className="mt-10 pt-6 border-t border-border/50 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          <Link href="/" className="hover:text-primary transition-colors">
            Back to foleyard.com
          </Link>
        </p>
      </main>
    </div>
  );
}
