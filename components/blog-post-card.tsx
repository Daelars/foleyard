import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface BlogPostCardProps {
  post: {
    _id: string;
    title: string;
    slug: string;
    excerpt: string;
    tags: string[];
    coverImage: string | null;
    publishedAt: number;
  };
  index?: number;
}

export function BlogPostCard({ post, index = 0 }: BlogPostCardProps) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="block group animate-reveal"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <Card className="h-full bg-background/50 backdrop-blur-sm border-border/50 group-hover:border-primary/50 transition-all duration-300 corner-tick corner-tick-tr corner-tick-bl shadow-sm group-hover:shadow-glow/20">
        {post.coverImage && (
          <div className="relative aspect-video overflow-hidden border-b border-border/50">
            <img
              src={post.coverImage}
              alt={post.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}
        <CardHeader className="p-6">
          <CardDescription className="flex justify-between items-center mb-3">
            <time className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {new Date(post.publishedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </time>
            <div className="flex gap-1.5">
              {post.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="text-[9px] font-mono font-bold uppercase tracking-widest border border-border px-1.5 py-0.5 rounded-sm group-hover:border-primary/30 group-hover:text-primary transition-colors"
                >
                  {tag}
                </span>
              ))}
            </div>
          </CardDescription>
          <CardTitle className="text-2xl font-serif font-bold group-hover:text-primary transition-colors leading-tight">
            {post.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0">
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {post.excerpt}
          </p>
          <div className="mt-4 flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-primary opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
            <span className="w-4 h-px bg-primary" />
            Read More
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
