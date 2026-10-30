import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { assertAdmin } from "./lib/admin";

// Page Queries & Mutations
export const getPageBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sitePages")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const updatePage = mutation({
  args: {
    slug: v.string(),
    title: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const existing = await ctx.db
      .query("sitePages")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        content: args.content,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("sitePages", {
        slug: args.slug,
        title: args.title,
        content: args.content,
        updatedAt: Date.now(),
      });
    }
  },
});

// Team Queries & Mutations
export const listTeamMembers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("teamMembers").withIndex("by_order").take(50);
  },
});

export const upsertTeamMember = mutation({
  args: {
    id: v.optional(v.id("teamMembers")),
    name: v.string(),
    role: v.string(),
    bio: v.string(),
    imageUrl: v.union(v.string(), v.null()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    const { id, ...data } = args;
    if (id) {
      await ctx.db.patch(id, data);
    } else {
      await ctx.db.insert("teamMembers", data);
    }
  },
});

export const deleteTeamMember = mutation({
  args: { id: v.id("teamMembers") },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);
    await ctx.db.delete(args.id);
  },
});

// Seed Initial Data
export const seedInitialData = mutation({
  args: {
    aboutContent: v.string(),
    founderBio: v.string(),
    foundersContent: v.string(),
    teamContent: v.string(),
    contactContent: v.string(),
    founderImageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx);

    const pages = [
      {
        slug: "about",
        title: "Foleyard: A Local-First Browser for Your Sound Library",
        content: args.aboutContent,
      },
      {
        slug: "founder",
        title: "Why I Built Foleyard",
        content: args.founderBio,
      },
      {
        slug: "founders",
        title: "Why I Built Foleyard",
        content: args.foundersContent,
      },
      {
        slug: "team",
        title: "Currently built by one person.",
        content: args.teamContent,
      },
      {
        slug: "contact",
        title: "Get in Touch",
        content: args.contactContent,
      },
    ];

    for (const page of pages) {
      const existingPage = await ctx.db
        .query("sitePages")
        .withIndex("by_slug", (q) => q.eq("slug", page.slug))
        .unique();

      if (existingPage) {
        await ctx.db.patch(existingPage._id, {
          title: page.title,
          content: page.content,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("sitePages", {
          ...page,
          updatedAt: Date.now(),
        });
      }
    }

    // Seed Initial Founder in Team
    const existingTeam = await ctx.db.query("teamMembers").take(1);
    if (existingTeam.length === 0) {
      await ctx.db.insert("teamMembers", {
        name: "Dalen (Dae)",
        role: "Founder & Lead Developer",
        bio: "Hi! I'm Dalen, or Dae. I'm the only member of the team currently, A bit about me, I love photography, video editing and coding! I also love a cheeky pint every so often.",
        imageUrl: args.founderImageUrl,
        order: 0,
      });
    }
  },
});
