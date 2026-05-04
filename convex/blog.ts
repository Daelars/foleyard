import { v } from "convex/values";
import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";

function readRole(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return (value as { role?: unknown }).role;
}

function hasAdminRole(identity: { [key: string]: unknown } | null) {
  const metadata = identity?.metadata as { role?: unknown } | undefined;
  const publicMetadata = identity?.publicMetadata as { role?: unknown } | undefined;
  const publicMetadataSnake = identity?.public_metadata as
    | { role?: unknown }
    | undefined;

  return (
    identity?.role === "admin" ||
    metadata?.role === "admin" ||
    publicMetadata?.role === "admin" ||
    publicMetadataSnake?.role === "admin" ||
    readRole(identity?.claims) === "admin"
  );
}

async function assertAdmin(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!hasAdminRole(identity)) {
    throw new Error("Unauthorized");
  }
}

export const listPosts = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    const posts = await ctx.db
      .query("blogPosts")
      .withIndex("by_publishedAt")
      .order("desc")
      .collect();

    return posts;
  },
});

export const getPostBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const post = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!post) {
      return null;
    }

    return post;
  },
});

export const getAuthDebug = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return { isAuthenticated: false, isAdmin: false, identity: null };
    }

    return {
      isAuthenticated: true,
      isAdmin: hasAdminRole(identity),
      identity,
    };
  },
});

export const createPost = mutation({
  args: {
    title: v.string(),
    slug: v.string(),
    content: v.string(),
    excerpt: v.string(),
    tags: v.array(v.string()),
    coverImage: v.union(v.string(), v.null()),
    publishedAt: v.number(),
  },
  handler: async (ctx: MutationCtx, args) => {
    await assertAdmin(ctx);

    const existing = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existing) {
      throw new Error(`Post with slug "${args.slug}" already exists`);
    }

    const postId = await ctx.db.insert("blogPosts", {
      title: args.title,
      slug: args.slug,
      content: args.content,
      excerpt: args.excerpt,
      tags: args.tags,
      coverImage: args.coverImage,
      publishedAt: args.publishedAt,
    });

    return postId;
  },
});

export const updatePost = mutation({
  args: {
    postId: v.id("blogPosts"),
    title: v.string(),
    slug: v.string(),
    content: v.string(),
    excerpt: v.string(),
    tags: v.array(v.string()),
    coverImage: v.union(v.string(), v.null()),
    publishedAt: v.number(),
  },
  handler: async (ctx: MutationCtx, args) => {
    await assertAdmin(ctx);

    const existing = await ctx.db.get(args.postId);
    if (!existing) {
      throw new Error("Post not found");
    }

    const slugConflict = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (slugConflict && slugConflict._id !== args.postId) {
      throw new Error(`Post with slug "${args.slug}" already exists`);
    }

    await ctx.db.patch(args.postId, {
      title: args.title,
      slug: args.slug,
      content: args.content,
      excerpt: args.excerpt,
      tags: args.tags,
      coverImage: args.coverImage,
      publishedAt: args.publishedAt,
    });
  },
});

export const deletePost = mutation({
  args: {
    postId: v.id("blogPosts"),
  },
  handler: async (ctx: MutationCtx, args) => {
    await assertAdmin(ctx);

    const existing = await ctx.db.get(args.postId);
    if (!existing) {
      throw new Error("Post not found");
    }

    await ctx.db.delete(args.postId);
  },
});
