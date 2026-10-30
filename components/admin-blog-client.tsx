"use client";

import { useState } from "react";
import { useConvex, useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AdminField,
  AdminHeader,
  AdminListRow,
  adminInputClass,
} from "@/components/admin-primitives";

const POSTS_PER_PAGE = 20;

type PostSummary =
  FunctionReturnType<typeof api.blog.listPostSummaries>["page"][number];

export function AdminBlogClient() {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [tags, setTags] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [editingId, setEditingId] = useState<Id<"blogPosts"> | null>(null);
  const [loadingPostId, setLoadingPostId] = useState<Id<"blogPosts"> | null>(
    null,
  );

  const convex = useConvex();
  const posts = usePaginatedQuery(
    api.blog.listPostSummaries,
    {},
    { initialNumItems: POSTS_PER_PAGE },
  );
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
    const fields = {
      title,
      slug,
      content,
      excerpt,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      coverImage: coverImage || null,
      publishedAt: Date.now(),
    };

    try {
      if (editingId) {
        await updatePost({ postId: editingId, ...fields });
      } else {
        await createPost(fields);
      }

      resetForm();
    } catch (error) {
      console.error(error);
      alert("Error saving post");
    }
  };

  const handleEdit = async (post: PostSummary) => {
    setLoadingPostId(post._id);

    try {
      const fullPost = await convex.query(api.blog.getPostBySlug, {
        slug: post.slug,
      });

      if (!fullPost) {
        throw new Error("Post not found");
      }

      setTitle(fullPost.title);
      setSlug(fullPost.slug);
      setContent(fullPost.content);
      setExcerpt(fullPost.excerpt);
      setTags(fullPost.tags.join(", "));
      setCoverImage(fullPost.coverImage || "");
      setEditingId(fullPost._id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      alert("Error loading post");
    } finally {
      setLoadingPostId(null);
    }
  };

  const handleDelete = async (postId: Id<"blogPosts">) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    await deletePost({ postId });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <AdminHeader eyebrow="Control Room" title="Blog" accent="Admin." />

      <form
        onSubmit={handleSubmit}
        className="space-y-6 mb-24 p-8 bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl corner-tick corner-tick-tr corner-tick-bl shadow-xl animate-reveal [animation-delay:100ms]"
      >
        <h2 className="text-2xl font-serif font-bold tracking-tight mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-primary rounded-full glow-primary-sm" />
          {editingId ? "Edit Dispatch" : "New Dispatch"}
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          <AdminField label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={adminInputClass}
              required
            />
          </AdminField>

          <AdminField label="Slug">
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={adminInputClass}
              required
            />
          </AdminField>
        </div>

        <AdminField label="Excerpt">
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            className={adminInputClass}
            rows={2}
            required
          />
        </AdminField>

        <AdminField label="Content (Markdown)">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={`${adminInputClass} font-mono text-sm`}
            rows={12}
            required
          />
        </AdminField>

        <div className="grid md:grid-cols-2 gap-6">
          <AdminField label="Tags (comma-separated)">
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className={adminInputClass}
            />
          </AdminField>

          <AdminField label="Cover Image URL">
            <input
              type="text"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              className={adminInputClass}
            />
          </AdminField>
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
        {posts.status === "LoadingFirstPage" ? (
          <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Retrieving data...
          </div>
        ) : posts.results.length === 0 ? (
          <p className="text-muted-foreground font-mono text-xs uppercase tracking-widest italic">
            The archives are currently empty.
          </p>
        ) : (
          <div className="grid gap-4">
            {posts.results.map((post) => (
              <AdminListRow
                key={post._id}
                title={post.title}
                subtitle={`/blog/${post.slug}`}
              >
                <button
                  onClick={() => handleEdit(post)}
                  disabled={loadingPostId === post._id}
                  className="px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest border border-border rounded-sm hover:border-primary/50 hover:text-primary transition-all disabled:cursor-wait disabled:opacity-60"
                >
                  {loadingPostId === post._id ? "Loading..." : "Modify"}
                </button>
                <button
                  onClick={() => handleDelete(post._id)}
                  className="px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest border border-border rounded-sm hover:border-destructive hover:text-destructive transition-all"
                >
                  Delete
                </button>
              </AdminListRow>
            ))}
          </div>
        )}

        {posts.status === "CanLoadMore" ? (
          <button
            onClick={() => posts.loadMore(POSTS_PER_PAGE)}
            className="w-full rounded-sm border border-border px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-all hover:border-primary/50 hover:text-primary"
          >
            Load older dispatches
          </button>
        ) : null}

        {posts.status === "LoadingMore" ? (
          <div className="flex items-center justify-center gap-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading more...
          </div>
        ) : null}
      </div>
    </div>
  );
}
