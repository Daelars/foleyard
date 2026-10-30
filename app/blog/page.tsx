import { fetchQuery } from "convex/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { BlogPostCard } from "@/components/blog-post-card";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { hasAdminRole } from "@/lib/clerk-admin";
import type { Metadata } from "next";

const POSTS_PER_PAGE = 9;

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Field notes on local-first audio workflows, sound design, and organizing messy SFX libraries.",
  alternates: { canonical: "/blog" },
};

interface BlogIndexProps {
  searchParams: Promise<{ cursor?: string | string[] }>;
}

function loadSummaries(cursor: string | null) {
  return fetchQuery(api.blog.listPostSummaries, {
    paginationOpts: { numItems: POSTS_PER_PAGE, cursor },
  });
}

export default async function BlogIndex({ searchParams }: BlogIndexProps) {
  const user = await currentUser();
  const canManagePosts = hasAdminRole(user?.publicMetadata);
  const params = await searchParams;
  let cursor =
    typeof params.cursor === "string" && params.cursor.length > 0
      ? params.cursor
      : null;

  let posts;
  try {
    posts = await loadSummaries(cursor);
  } catch (error) {
    // Without a cursor there is nothing to blame but the query itself, so let
    // the error surface. With a cursor, retry page 1 once: a bad cursor is the
    // likely cause, and if the retry fails too the outage is real and the
    // retry's error propagates.
    if (!cursor) throw error;
    cursor = null;
    posts = await loadSummaries(null);
  }

  return (
    <div className="relative min-h-screen selection:bg-primary selection:text-primary-foreground">
      <div className="grain" />
      <div className="fixed inset-0 grid-pattern opacity-20 pointer-events-none" />

      <Navbar />

      <main className="relative z-10 py-12 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <header className="mb-16 animate-reveal">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="w-12 h-px bg-primary" />
                <span className="font-mono text-xs text-primary font-bold uppercase tracking-[0.2em]">
                  Field Notes
                </span>
              </div>
              {canManagePosts ? (
                <Link
                  href="/admin/blog"
                  className="rounded-sm border border-primary/40 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  New post
                </Link>
              ) : null}
            </div>
            <h1 className="text-5xl md:text-8xl font-serif font-bold leading-[0.85] tracking-tighter">
              The <span className="text-primary italic glow-primary-sm">Foleyard</span> Blog.
            </h1>
            <p className="mt-6 text-xl text-muted-foreground max-w-2xl leading-relaxed">
              Insights, updates, and deep dives into local-first audio workflows and sound design.
            </p>
          </header>

          {posts.page.length === 0 ? (
            <div className="py-24 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-center animate-reveal [animation-delay:200ms]">
              <div className="w-12 h-12 bg-muted rounded-full mb-4 flex items-center justify-center font-mono text-muted-foreground">
                ?
              </div>
              <p className="text-muted-foreground font-mono uppercase tracking-widest text-xs">
                {cursor
                  ? "This page of the archives is empty."
                  : "No posts found in the archives."}
              </p>
              {cursor ? (
                <Link
                  href="/blog"
                  className="mt-6 rounded-sm border border-border px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  Back to the newest dispatches
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {posts.page.map((post, index) => (
                <BlogPostCard key={post._id} post={post} index={index + 1} />
              ))}
            </div>
          )}

          {posts.page.length > 0 && (!posts.isDone || cursor) ? (
            <nav
              aria-label="Blog pagination"
              className="mt-16 flex flex-wrap items-center justify-center gap-4 animate-reveal [animation-delay:200ms]"
            >
              {cursor ? (
                <Link
                  href="/blog"
                  className="rounded-sm border border-border px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  Newest first
                </Link>
              ) : null}
              {!posts.isDone ? (
                <Link
                  href={`/blog?cursor=${encodeURIComponent(posts.continueCursor)}`}
                  className="rounded-sm bg-primary px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  Older dispatches
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  );
}
