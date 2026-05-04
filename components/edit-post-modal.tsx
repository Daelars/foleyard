"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { GenericModal } from "./generic-modal";

interface EditPostModalProps {
  post: {
    _id: Id<"blogPosts">;
    title: string;
    slug: string;
    content: string;
    excerpt: string;
    tags: string[];
    coverImage: string | null;
    publishedAt: number;
  };
}

export function EditPostModal({ post }: EditPostModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [content, setContent] = useState(post.content);
  const [excerpt, setExcerpt] = useState(post.excerpt);
  const [tags, setTags] = useState(post.tags.join(", "));
  const [coverImage, setCoverImage] = useState(post.coverImage || "");

  const updatePost = useMutation(api.blog.updatePost);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const tagArray = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      setErrorMessage(null);

      await updatePost({
        postId: post._id,
        title,
        slug,
        content,
        excerpt,
        tags: tagArray,
        coverImage: coverImage || null,
        publishedAt: post.publishedAt,
      });

      setIsOpen(false);
      if (slug !== post.slug) {
        router.push(`/blog/${slug}`);
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "Error updating post",
      );
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-1 text-xs font-mono uppercase tracking-widest border border-border rounded-sm hover:border-primary/50 transition-colors"
      >
        Edit
      </button>

      <GenericModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Edit Post"
      >
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {errorMessage}
              </p>
            ) : null}

            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2 bg-background border border-border rounded-md text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
                Slug
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full p-2 bg-background border border-border rounded-md text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
                Excerpt
              </label>
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                className="w-full p-2 bg-background border border-border rounded-md text-sm"
                rows={2}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
                Content (Markdown)
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full p-2 bg-background border border-border rounded-md font-mono text-sm"
                rows={12}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full p-2 bg-background border border-border rounded-md text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">
                Cover Image URL
              </label>
              <input
                type="text"
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                className="w-full p-2 bg-background border border-border rounded-md text-sm"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-primary/90"
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 border border-border text-xs font-bold uppercase tracking-widest rounded-sm hover:border-primary/50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </GenericModal>
    </>
  );
}
