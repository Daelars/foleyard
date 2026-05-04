import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { BlogPostCard } from "@/components/blog-post-card";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export default async function BlogIndex() {
  const posts = await fetchQuery(api.blog.listPosts, {});

  return (
    <div className="relative min-h-screen selection:bg-primary selection:text-primary-foreground">
      <div className="grain" />
      <div className="fixed inset-0 grid-pattern opacity-20 pointer-events-none" />

      <Navbar />

      <main className="relative z-10 py-12 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <header className="mb-16 animate-reveal">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-12 h-px bg-primary" />
              <span className="font-mono text-xs text-primary font-bold uppercase tracking-[0.2em]">
                Field Notes
              </span>
            </div>
            <h1 className="text-5xl md:text-8xl font-serif font-bold leading-[0.85] tracking-tighter">
              The <span className="text-primary italic glow-primary-sm">Foleyard</span> Blog.
            </h1>
            <p className="mt-6 text-xl text-muted-foreground max-w-2xl leading-relaxed">
              Insights, updates, and deep dives into local-first audio workflows and sound design.
            </p>
          </header>

          {posts.length === 0 ? (
            <div className="py-24 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-center animate-reveal [animation-delay:200ms]">
              <div className="w-12 h-12 bg-muted rounded-full mb-4 flex items-center justify-center font-mono text-muted-foreground">
                ?
              </div>
              <p className="text-muted-foreground font-mono uppercase tracking-widest text-xs">
                No posts found in the archives.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {posts.map((post, index) => (
                <BlogPostCard key={post._id} post={post} index={index + 1} />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
