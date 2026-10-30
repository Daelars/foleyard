import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { assertAdmin } from "./lib/admin";
import {
  DEFAULT_PAGE_COPY,
  FOUNDER_BIO,
  SITE_PAGE_SLUGS,
  type SitePageSlug,
} from "../lib/site-copy";

type SitePageDraft = { slug: string; title: string; content: string };

async function upsertSitePage(ctx: MutationCtx, page: SitePageDraft) {
  const existing = await ctx.db
    .query("sitePages")
    .withIndex("by_slug", (q) => q.eq("slug", page.slug))
    .unique();

  const updatedAt = Date.now();

  if (existing) {
    await ctx.db.patch(existing._id, {
      title: page.title,
      content: page.content,
      updatedAt,
    });
    return;
  }

  await ctx.db.insert("sitePages", {
    ...page,
    updatedAt,
  });
}

// Page Queries & Mutations
export const getPageBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx: QueryCtx, args) => {
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
  handler: async (ctx: MutationCtx, args) => {
    await assertAdmin(ctx);
    await upsertSitePage(ctx, args);
  },
});

// Team Queries & Mutations
export const listTeamMembers = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
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
  handler: async (ctx: MutationCtx, args) => {
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
  handler: async (ctx: MutationCtx, args) => {
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
  handler: async (ctx: MutationCtx, args) => {
    await assertAdmin(ctx);

    const contentBySlug: Record<SitePageSlug, string> = {
      about: args.aboutContent,
      founder: args.founderBio,
      founders: args.foundersContent,
      team: args.teamContent,
      contact: args.contactContent,
    };

    for (const slug of SITE_PAGE_SLUGS) {
      await upsertSitePage(ctx, {
        slug,
        title: DEFAULT_PAGE_COPY[slug].title,
        content: contentBySlug[slug],
      });
    }

    // Seed Initial Founder in Team
    const existingTeam = await ctx.db.query("teamMembers").take(1);
    if (existingTeam.length === 0) {
      await ctx.db.insert("teamMembers", {
        name: "Dalen (Dae)",
        role: "Founder & Lead Developer",
        bio: FOUNDER_BIO,
        imageUrl: args.founderImageUrl,
        order: 0,
      });
    }
  },
});

export const internalSeed = internalMutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    const pages = [
      {
        slug: "about",
        title: "Foleyard: A Local-First Browser for Your Sound Library",
        content: `# The Mission\n\nAudio libraries don't get messy overnight. They grow slowly. Foleyard is a local-first browser for large collections of sound effects and music.`,
      },
      {
        slug: "founder",
        title: "Why I Built Foleyard",
        content: `# The Story\n\nI built Foleyard because my own sound library became annoying to use.\n\nHi! I'm Dalen, or Dae. I'm the only member of the team currently. I love photography, video editing and coding! I also love a cheeky pint every now and then.`,
      },
      {
        slug: "founders",
        title: "Why I Built Foleyard",
        content: `# The Story\n\nI built Foleyard because my own sound library became annoying to use.\n\nHi! I'm Dalen, or Dae. I'm the only member of the team currently. I love photography, video editing and coding! I also love a cheeky pint every now and then.`,
      },
      {
        slug: "team",
        title: "Currently built by one person.",
        content: `Foleyard is currently built by one person, with the project shaped by real feedback from people who work with sound libraries.`,
      },
      {
        slug: "contact",
        title: "Get in Touch",
        content: `# Contact\n\nQuestions, feedback, bug reports, workflow ideas, or just curious about where Foleyard is heading? I would love to hear from you.\n\n- Email: [contact@foleyard.com](mailto:contact@foleyard.com)\n- GitHub: [Daelars/foleyard-v1](https://github.com/Daelars/foleyard-v1)`,
      },
    ];

    for (const page of pages) {
      const existingPage = await ctx.db
        .query("sitePages")
        .withIndex("by_slug", (q) => q.eq("slug", page.slug))
        .unique();

      if (!existingPage) {
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
        imageUrl: "/about-me/profile_picture.jpeg",
        order: 0,
      });
    }
  },
});
