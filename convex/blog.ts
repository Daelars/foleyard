import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { assertAdmin } from "./lib/admin";

const MAX_PAGE_SIZE = 50;

function toPostSummary(post: Doc<"blogPosts">) {
  return {
    _id: post._id,
    _creationTime: post._creationTime,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    tags: post.tags,
    coverImage: post.coverImage,
    publishedAt: post.publishedAt,
  };
}

export const listPostSummaries = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx: QueryCtx, args) => {
    const result = await ctx.db
      .query("blogPosts")
      .withIndex("by_publishedAt")
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(args.paginationOpts.numItems, MAX_PAGE_SIZE),
      });

    return {
      ...result,
      page: result.page.map(toPostSummary),
    };
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
