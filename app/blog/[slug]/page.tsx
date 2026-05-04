import { fetchQuery } from "convex/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import { notFound } from "next/navigation";
import { marked } from "marked";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { EditPostModal } from "@/components/edit-post-modal";
import { hasAdminRole } from "@/lib/clerk-admin";

interface BlogPostProps {
  params: Promise<{ slug: string }>;
}

export default async function BlogPost({ params }: BlogPostProps) {
  const { slug } = await params;
  const user = await currentUser();
  const post = await fetchQuery(api.blog.getPostBySlug, { slug });

  if (!post) {
    notFound();
  }

  const htmlContent = marked.parse(post.content) as string;
  const canEdit = hasAdminRole(user?.publicMetadata);

  return (
    <div className="relative min-h-screen selection:bg-primary selection:text-primary-foreground">
      <div className="grain" />
      <div className="fixed inset-0 grid-pattern opacity-20 pointer-events-none" />

      <Navbar />

      <main className="relative z-10 py-12 px-6 md:px-12">
        <article className="max-w-4xl mx-auto">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors mb-12 group animate-reveal"
          >
            <span className="w-6 h-px bg-muted-foreground group-hover:bg-primary group-hover:w-8 transition-all" />
            Back to Blog
          </Link>

          <header className="mb-12 animate-reveal [animation-delay:100ms]">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest border border-primary/30 text-primary rounded-sm bg-primary/5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              {canEdit ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/admin/blog"
                    className="px-3 py-1 text-xs font-mono uppercase tracking-widest border border-border rounded-sm hover:border-primary/50 transition-colors"
                  >
                    New post
                  </Link>
                  <EditPostModal post={post} />
                </div>
              ) : null}
            </div>

            <h1 className="text-4xl md:text-7xl font-serif font-bold leading-[0.95] tracking-tighter mb-6">
              {post.title}
            </h1>

            <div className="flex items-center gap-4 text-muted-foreground">
              <time className="font-mono text-xs uppercase tracking-widest">
                {new Date(post.publishedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
              <span className="w-1 h-1 bg-border rounded-full" />
              <span className="font-mono text-xs uppercase tracking-widest">
                Archive // {post.slug}
              </span>
            </div>
          </header>

          {post.coverImage && (
            <div className="mb-16 animate-reveal [animation-delay:200ms]">
              <div className="relative aspect-video rounded-2xl overflow-hidden border border-border shadow-2xl corner-tick corner-tick-tr corner-tick-bl">
                <img
                  src={post.coverImage}
                  alt={post.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent" />
              </div>
            </div>
          )}

          <div className="animate-reveal [animation-delay:300ms]">
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
