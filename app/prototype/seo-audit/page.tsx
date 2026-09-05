// Three variants of the SEO audit, switchable via `?variant=`, on throwaway route `/prototype/seo-audit`.
// PROTOTYPE — throwaway, do not ship to production. See skill: prototype UI sub-shape B.
import { Suspense } from "react";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { SITE_URL } from "@/lib/seo";

const VARIANTS = [
  { key: "A", label: "Audit report" },
  { key: "B", label: "Head tags before/after" },
  { key: "C", label: "Machine files preview" },
];

const FINDINGS = [
  {
    check: "robots.txt",
    before: "Missing (404)",
    after: "app/robots.ts — allows /, blocks /admin /api /sign-out, lists sitemap + host",
    status: "fixed",
  },
  {
    check: "sitemap.xml",
    before: "Missing",
    after: "app/sitemap.ts — 7 static routes + dynamic /blog/[slug] via Convex",
    status: "fixed",
  },
  {
    check: "llms.txt",
    before: "Missing",
    after: "app/llms.txt/route.ts — definition sentence, pages, facts, machine files",
    status: "fixed",
  },
  {
    check: "manifest",
    before: "Missing",
    after: "app/manifest.ts — name, icons, theme-color",
    status: "fixed",
  },
  {
    check: "OG / Twitter images",
    before: "Missing",
    after: "app/opengraph-image.tsx (1200x630) + per-post cover fallback",
    status: "fixed",
  },
  {
    check: "Canonical + metadataBase",
    before: "No metadataBase, no canonical, flat titles",
    after: "Title template '%s - Foleyard', canonical per page, OG/Twitter defaults",
    status: "fixed",
  },
  {
    check: "Blog generateMetadata",
    before: "No per-post metadata",
    after: "generateMetadata on /blog/[slug] + BlogPosting JSON-LD",
    status: "fixed",
  },
  {
    check: "Organization JSON-LD",
    before: "No structured data",
    after: "SiteJsonLd: Organization + WebSite + SoftwareApplication",
    status: "fixed",
  },
];

function VariantA() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">
        PROTOTYPE A — Audit report
      </p>
      <h1 className="text-4xl font-bold tracking-tight">
        Foleyard SEO audit: what was missing and what changed.
      </h1>
      <blockquote className="border-l-4 border-primary pl-4 text-lg text-muted-foreground">
        TL;DR: Foleyard had solid H1s and copy but zero crawler files. No
        robots.txt, sitemap, llms.txt, manifest, OG images, canonicals, or
        structured data. This change adds all of them using Next file
        conventions.
      </blockquote>
      <h2 className="text-2xl font-bold">What is this audit?</h2>
      <p className="text-muted-foreground leading-relaxed">
        Foleyard is a local-first browser for large collections of sound
        effects, music cues, samples, loops, and audio assets. This audit
        checks the gap between that clear positioning and what search engines
        and AI engines can actually read.
      </p>
      <h2 className="text-2xl font-bold">Findings</h2>
      <table className="w-full text-sm border border-border">
        <thead>
          <tr className="bg-secondary text-left font-mono text-xs uppercase">
            <th className="p-2 border-b">Check</th>
            <th className="p-2 border-b">Before</th>
            <th className="p-2 border-b">After</th>
          </tr>
        </thead>
        <tbody>
          {FINDINGS.map((f) => (
            <tr key={f.check} className="border-b border-border/50">
              <td className="p-2 font-bold">{f.check}</td>
              <td className="p-2 text-muted-foreground">{f.before}</td>
              <td className="p-2">{f.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="text-2xl font-bold">FAQ</h2>
      <div className="space-y-4 text-sm">
        {[
          ["What is Foleyard?", "Foleyard is a local-first browser for messy SFX folders, music cues, and large audio libraries."],
          ["Do I need to upload my sounds?", "No. Files stay on your machine; Foleyard indexes the folder you point it at."],
          ["Who is it for?", "Video editors, sound designers, game developers, filmmakers, and producers with local libraries."],
          ["Is Foleyard live?", "Yes. Foleyard v1 is out. The homepage CTA is DOWNLOAD FOLEYARD."],
          ["Where is the code?", "Open source at github.com/Daelars/foleyard-v1."],
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
        PROTOTYPE B — Head tags
      </p>
      <h1 className="text-4xl font-bold tracking-tight">
        Before vs after: the document head.
      </h1>
      <div className="grid md:grid-cols-2 gap-4 text-xs font-mono">
        <pre className="p-4 rounded border border-red-500/40 bg-red-500/5 overflow-auto">
          {`<title>Foleyard - Find the right sound...</title>
<meta name="description" content="A local-first browser..." />
<!-- missing: canonical, OG, twitter, robots, JSON-LD, manifest, viewport theme -->`}
        </pre>
        <pre className="p-4 rounded border border-green-500/40 bg-green-500/5 overflow-auto">
          {`metadataBase: ${SITE_URL}
title: { default, template: "%s - Foleyard" }
canonical: per-page (/about, /blog, /blog/[slug]...)
openGraph: website + article for posts
twitter: summary_large_image
robots: index, follow
manifest: /manifest.webmanifest
JSON-LD: Organization + SoftwareApplication + BlogPosting`}
        </pre>
      </div>
    </div>
  );
}

function VariantC() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">
        PROTOTYPE C — Machine files
      </p>
      <h1 className="text-4xl font-bold tracking-tight">
        Crawlers and LLMs: what they get now.
      </h1>
      <ul className="space-y-3 text-sm">
        {[
          ["/robots.txt", "Allow /, block /admin /api /sign-out, sitemap + host declared"],
          ["/sitemap.xml", "Static routes + live blog slugs from Convex"],
          ["/llms.txt", "One-page brief: definition, pages, facts, machine files"],
          ["/manifest.webmanifest", "Installable name, icons, theme color"],
          ["/opengraph-image", "Generated 1200x630 social card"],
        ].map(([path, desc]) => (
          <li key={path} className="border border-border rounded p-3">
            <a href={path} className="font-mono font-bold text-primary underline">
              {path}
            </a>
            <p className="text-muted-foreground">{desc}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function SeoAuditPrototype({
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
