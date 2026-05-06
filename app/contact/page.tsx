import { fetchQuery } from "convex/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import { marked } from "marked";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { hasAdminRole } from "@/lib/clerk-admin";
import { CONTACT_MARKDOWN, useDefaultWhenLegacy } from "@/lib/site-defaults";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact - Foleyard",
  description: "Get in touch with Foleyard about feedback, testing, and the local-first audio browser.",
};

export default async function ContactPage() {
  const user = await currentUser();
  const page = await fetchQuery(api.site.getPageBySlug, { slug: "contact" });
  const canEdit = hasAdminRole(user?.publicMetadata);

  const title = page?.title || "Get in Touch";
  const content = useDefaultWhenLegacy(page?.content, CONTACT_MARKDOWN);
  const htmlContent = marked.parse(content) as string;

  // Split title to highlight the last word
  const titleWords = title.split(" ");
  const lastWord = titleWords.pop();
  const titleStart = titleWords.join(" ");

  return (
    <div className="relative min-h-screen selection:bg-primary selection:text-primary-foreground">
      <div className="grain" />
      <div className="fixed inset-0 grid-pattern opacity-20 pointer-events-none" />

      <Navbar />

      <main className="relative z-10 py-24 px-6 md:px-12 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 hatch opacity-5 -translate-y-1/3 translate-x-1/3 pointer-events-none" />

        <article className="max-w-4xl mx-auto">
          <header className="mb-16 animate-reveal">
            <div className="flex items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-3">
                <span className="w-12 h-px bg-primary" />
                <span className="font-mono text-xs text-primary font-bold uppercase tracking-[0.2em]">
                  Contact
                </span>
              </div>
              {canEdit && (
                <Link
                  href="/admin/site?page=contact"
                  className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest border border-border rounded-sm hover:border-primary/50 transition-colors"
                >
                  Edit Page
                </Link>
              )}
            </div>

            <h1 className="text-5xl md:text-8xl font-serif font-bold leading-[0.85] tracking-tighter mb-8">
              {titleStart}{" "}
              <span className="text-primary italic glow-primary-sm">
                {lastWord}
              </span>
            </h1>
          </header>

          <div className="animate-reveal [animation-delay:200ms] relative">
            <div className="absolute -inset-8 border border-border/30 rounded-2xl pointer-events-none corner-tick corner-tick-tl corner-tick-br opacity-50" />
            <div
              className="prose prose-lg prose-invert max-w-none
                prose-headings:font-serif prose-headings:font-bold prose-headings:tracking-tighter
                prose-p:text-muted-foreground prose-p:leading-relaxed
                prose-strong:text-foreground prose-strong:font-bold
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                prose-img:rounded-xl prose-img:border prose-img:border-border
                prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded-sm prose-code:before:content-none prose-code:after:content-none"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
