import type { MetadataRoute } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { PUBLIC_ROUTES, SITE_URL } from "@/lib/seo";

const POSTS_PER_PAGE = 50;

interface PostSummaryPage {
  page: { slug: string; publishedAt: number }[];
  isDone: boolean;
  continueCursor: string;
}

function fetchPostSummaryPage(
  cursor: string | null,
): Promise<PostSummaryPage> {
  return fetchQuery(api.blog.listPostSummaries, {
    paginationOpts: { numItems: POSTS_PER_PAGE, cursor },
  });
}

async function loadAllPostLinks() {
  const posts: { slug: string; publishedAt: number }[] = [];
  let cursor: string | null = null;
  let page: PostSummaryPage;

  do {
    page = await fetchPostSummaryPage(cursor);

    for (const post of page.page) {
      posts.push({ slug: post.slug, publishedAt: post.publishedAt });
    }

    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor !== null);

  return posts;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticUrls: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path || "/"}`,
    lastModified: new Date(),
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  try {
    const posts = await loadAllPostLinks();
    const postUrls: MetadataRoute.Sitemap = posts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
    return [...staticUrls, ...postUrls];
  } catch {
    return staticUrls;
  }
}
