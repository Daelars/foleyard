"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function AdminBlogClient() {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [tags, setTags] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [editingId, setEditingId] = useState<Id<"blogPosts"> | null>(null);

  const posts = useQuery(api.blog.listPosts);
  const createPost = useMutation(api.blog.createPost);
  const updatePost = useMutation(api.blog.updatePost);
  const deletePost = useMutation(api.blog.deletePost);

  const resetForm = () => {
    setTitle("");
    setSlug("");
    setContent("");
    setExcerpt("");
    setTags("");
    setCoverImage("");
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tagArray = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (editingId) {
        await updatePost({
          postId: editingId,
          title,
          slug,
          content,
          excerpt,
          tags: tagArray,
          coverImage: coverImage || null,
          publishedAt: Date.now(),
        });
      } else {
        await createPost({
          title,
          slug,
          content,
          excerpt,
          tags: tagArray,
          coverImage: coverImage || null,
          publishedAt: Date.now(),
        });
      }

      resetForm();
    } catch (error) {
      console.error(error);
      alert("Error saving post");
    }
  };

  const handleEdit = (post: NonNullable<typeof posts>[number]) => {
    setTitle(post.title);
    setSlug(post.slug);
    setContent(post.content);
    setExcerpt(post.excerpt);
    setTags(post.tags.join(", "));
    setCoverImage(post.coverImage || "");
    setEditingId(post._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (postId: Id<"blogPosts">) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    await deletePost({ postId });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-12 animate-reveal">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-12 h-px bg-primary" />
          <span className="font-mono text-xs text-primary font-bold uppercase tracking-[0.2em]">
            Control Room
          </span>
        </div>
        <h1 className="text-4xl md:text-6xl font-serif font-bold tracking-tighter">
          Blog <span className="text-primary italic">Admin.</span>
        </h1>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 mb-24 p-8 bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl corner-tick corner-tick-tr corner-tick-bl shadow-xl animate-reveal [animation-delay:100ms]"
      >
        <h2 className="text-2xl font-serif font-bold tracking-tight mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-primary rounded-full glow-primary-sm" />
          {editingId ? "Edit Dispatch" : "New Dispatch"}
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
              Slug
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
            Excerpt
          </label>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            className="w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
            rows={2}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
            Content (Markdown)
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all font-mono text-sm"
            rows={12}
            required
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
              Cover Image URL
            </label>
            <input
              type="text"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              className="w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            className="px-8 py-3 bg-primary text-primary-foreground font-mono font-bold uppercase tracking-widest rounded-sm hover:scale-[1.02] active:scale-[0.98] transition-all glow-primary"
          >
            {editingId ? "Update Archive" : "Publish Dispatch"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-8 py-3 border border-border font-mono font-bold uppercase tracking-widest text-muted-foreground rounded-sm hover:border-primary/50 hover:text-primary transition-all"
            >
              Discard Changes
            </button>
          )}
        </div>
      </form>

      <div className="space-y-8 animate-reveal [animation-delay:200ms]">
        <h2 className="text-2xl font-serif font-bold tracking-tight border-b border-border/50 pb-4">
          Recent Dispatches
        </h2>
        {!posts ? (
          <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Retrieving data...
          </div>
        ) : posts.length === 0 ? (
          <p className="text-muted-foreground font-mono text-xs uppercase tracking-widest italic">
            The archives are currently empty.
          </p>
        ) : (
          <div className="grid gap-4">
            {posts.map((post) => (
              <div
                key={post._id}
                className="flex items-center justify-between p-6 bg-card/30 backdrop-blur-sm border border-border/50 rounded-xl group hover:border-primary/30 transition-all"
              >
                <div>
                  <h3 className="font-serif font-bold text-lg group-hover:text-primary transition-colors">
                    {post.title}
                  </h3>
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                    /blog/{post.slug}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleEdit(post)}
                    className="px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest border border-border rounded-sm hover:border-primary/50 hover:text-primary transition-all"
                  >
                    Modify
                  </button>
                  <button
                    onClick={() => handleDelete(post._id)}
                    className="px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest border border-border rounded-sm hover:border-destructive hover:text-destructive transition-all"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
