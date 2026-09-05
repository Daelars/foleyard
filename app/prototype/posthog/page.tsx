// Three variants of the PostHog exploration, switchable via `?variant=`, on throwaway route `/prototype/posthog`.
// PROTOTYPE — throwaway, no production code. No SDK installed, nothing wired. See skill: prototype UI sub-shape B.
import { Suspense } from "react";
import { PrototypeSwitcher } from "@/components/prototype-switcher";

const VARIANTS = [
  { key: "A", label: "The blind spots" },
  { key: "B", label: "Event taxonomy" },
  { key: "C", label: "The payoff" },
];

function VariantA() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">
        PROTOTYPE A — Why PostHog
      </p>
      <h1 className="text-4xl font-bold tracking-tight">
        You can count downloads. You can't explain them.
      </h1>
      <blockquote className="border-l-4 border-primary pl-4 text-lg text-muted-foreground">
        TL;DR: Vercel Analytics tells you how many people visited. A download
        counter tells you how many clicked. Nothing tells you what happened in
        between, who came back, or whether the launch email did anything.
        PostHog fills exactly that gap: funnels, replays, and flags in one
        free tier.
      </blockquote>
      <h2 className="text-2xl font-bold">What you know today</h2>
      <table className="w-full text-sm border border-border">
        <thead>
          <tr className="bg-secondary text-left font-mono text-xs uppercase">
            <th className="p-2 border-b">Signal</th>
            <th className="p-2 border-b">Source</th>
            <th className="p-2 border-b">Missing</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Pageviews", "Vercel Analytics", "Who viewed, what they did next"],
            ["Download count", "Convex downloads table", "Which page led here, repeat vs new"],
            ["Email signups", "waitlist / downloadSignups", "Did they download after? Open the thank-you?"],
            ["Launch email", "Resend sent/failed flags", "Opens, clicks, downstream downloads"],
            ["Blog reads", "Nothing", "Everything: reads, scroll depth, return visits"],
          ].map(([s, src, miss]) => (
            <tr key={s} className="border-b border-border/50">
              <td className="p-2 font-bold">{s}</td>
              <td className="p-2 text-muted-foreground">{src}</td>
              <td className="p-2">{miss}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="text-2xl font-bold">5 questions PostHog would answer</h2>
      <div className="space-y-3 text-sm">
        {[
          ["What % of homepage visitors reach the download button?", "Funnel: $pageview (/) → download_started. Today: unknowable."],
          ["Does the 'email me the link' panel earn its place?", "Funnel: download_started → download_email_captured. If <2%, redesign or drop it."],
          ["Do thank-you emails drive installs or just sit unopened?", "Link Resend open/click events to later site visits by email identity."],
          ["Which blog posts create downloaders?", "Path analysis: /blog/[slug] → / → download_started per post."],
          ["Where do visitors rage-click or bounce?", "Session replays of the landing page, no guessing from copy alone."],
        ].map(([q, a]) => (
          <div key={q} className="border border-border rounded p-3">
            <p className="font-bold">{q}</p>
            <p className="text-muted-foreground">{a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function VariantB() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">
        PROTOTYPE B — What we'd track
      </p>
      <h1 className="text-4xl font-bold tracking-tight">
        8 events, mapped to code you already have.
      </h1>
      <p className="text-muted-foreground">
        Client events via <code className="text-primary">posthog-js</code> in{" "}
        <code className="text-primary">instrumentation-client.ts</code>;
        server events via <code className="text-primary">posthog-node</code>{" "}
        in the Convex email actions and Next API routes. Identity links by
        email wherever we capture one. Nothing here is wired — this is the
        plan.
      </p>
      <table className="w-full text-sm border border-border">
        <thead>
          <tr className="bg-secondary text-left font-mono text-xs uppercase">
            <th className="p-2 border-b">Event</th>
            <th className="p-2 border-b">Fires in</th>
            <th className="p-2 border-b">Side</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["landing_viewed", "app/page.tsx (pageview w/ launched flag)", "client (autocapture)"],
            ["download_started", "DownloadPanel startDownload()", "client"],
            ["download_email_captured", "/api/download-signup success", "client + server"],
            ["waitlist_joined", "/api/waitlist success", "client + server"],
            ["thankyou_email_sent", "downloadEmail / waitlistEmail actions", "server"],
            ["launch_email_opened", "Resend webhook → Convex http.ts", "server"],
            ["blog_post_read", "app/blog/[slug] (scroll depth)", "client"],
            ["release_checked", "/api/latest-release (cached)", "server"],
          ].map(([e, where, side]) => (
            <tr key={e} className="border-b border-border/50">
              <td className="p-2 font-mono font-bold text-primary">{e}</td>
              <td className="p-2 text-muted-foreground">{where}</td>
              <td className="p-2">{side}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="text-2xl font-bold">Setup shape (Next 16)</h2>
      <pre className="p-4 rounded border border-border bg-card text-xs font-mono overflow-auto">
        {`bun add posthog-js posthog-node        # only when approved
instrumentation-client.ts               # posthog.init(token, { api_host: '/fy-ingest' })
next.config.ts rewrites                 # /fy-ingest/* -> PostHog (ad-blocker proof)
lib/posthog-server.ts                   # singleton posthog-node client
proxy.ts                                # note: file already exists, merge matchers`}
      </pre>
      <p className="text-sm text-muted-foreground">
        Watch-outs found during recon: this repo already has{" "}
        <code className="text-primary">proxy.ts</code> (auth middleware), so
        the PostHog rewrite must merge matchers, not replace the file. And
        the docs warn against obvious paths like{" "}
        <code className="text-primary">/analytics</code> — hence{" "}
        <code className="text-primary">/fy-ingest</code>.
      </p>
    </div>
  );
}

function VariantC() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">
        PROTOTYPE C — The payoff
      </p>
      <h1 className="text-4xl font-bold tracking-tight">
        What you'd see on day 30.
      </h1>
      <div className="border border-border rounded-2xl p-6 space-y-4">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Mock funnel — landing → download → email
        </p>
        {[
          ["landing_viewed", "1,000", "100%"],
          ["download_started", "180", "18%"],
          ["download_email_captured", "36", "20% of downloaders"],
        ].map(([step, n, pct]) => (
          <div key={step}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-mono font-bold text-primary">{step}</span>
              <span className="text-muted-foreground">
                {n} · {pct}
              </span>
            </div>
            <div className="h-3 rounded bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{
                  width: step === "landing_viewed" ? "100%" : step === "download_started" ? "18%" : "3.6%",
                }}
              />
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground font-mono">
          Numbers are illustrative. The point: each bar is currently a guess.
        </p>
      </div>
      <h2 className="text-2xl font-bold">Beyond charts</h2>
      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <div className="border border-border rounded p-4">
          <p className="font-bold mb-1">Session replays</p>
          <p className="text-muted-foreground">
            Watch real visits to the hero: do people see the download button,
            or bounce on the video? One replay beats ten opinions.
          </p>
        </div>
        <div className="border border-border rounded p-4">
          <p className="font-bold mb-1">Feature flags</p>
          <p className="text-muted-foreground">
            Roll the email-capture panel to 50% of visitors, or test hero
            copy variants, without redeploying. Kill losers with a toggle.
          </p>
        </div>
        <div className="border border-border rounded p-4">
          <p className="font-bold mb-1">Email → download joins</p>
          <p className="text-muted-foreground">
            Identify downloaders by email, then tie Resend opens to actual
            return visits. Finally know if the thank-you email works.
          </p>
        </div>
        <div className="border border-border rounded p-4">
          <p className="font-bold mb-1">Cost: free tier</p>
          <p className="text-muted-foreground">
            1M events/month free on Cloud. This site's volume fits comfortably;
            self-host later if it ever outgrows it.
          </p>
        </div>
      </div>
      <h2 className="text-2xl font-bold">Verdict (prototype opinion)</h2>
      <p className="text-muted-foreground leading-relaxed">
        Yes, add it — but events-only first. Pageviews already exist, so phase
        1 is the 8 events in variant B plus the rewrite proxy. Replays and
        flags come free with the same install, so enable replays on the
        landing page only (session recordings are the bandwidth hog). Skip
        server-side flags until there's a logged-in surface worth gating.
      </p>
    </div>
  );
}

export default async function PosthogPrototype({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  const { variant } = await searchParams;
  const current = variant ?? "A";
  return (
    <main className="px-6 py-16 pb-28">
      <Suspense fallback={null}>
        {current === "B" ? <VariantB /> : current === "C" ? <VariantC /> : <VariantA />}
        <PrototypeSwitcher variants={VARIANTS} current={current} />
      </Suspense>
    </main>
  );
}
