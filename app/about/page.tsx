import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { CmsPage } from "@/components/cms-page";
import { isCurrentUserAdmin } from "@/lib/clerk-admin";
import { DEFAULT_PAGE_COPY } from "@/lib/site-copy";
import { stripLeadingMarkdownTitle, useDefaultWhenLegacy } from "@/lib/site-defaults";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about Foleyard, a local-first browser for messy sound libraries and audio folders.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const canEdit = await isCurrentUserAdmin();
  const page = await fetchQuery(api.site.getPageBySlug, { slug: "about" });

  const title = page?.title || DEFAULT_PAGE_COPY.about.title;
  const content = stripLeadingMarkdownTitle(
    useDefaultWhenLegacy(page?.content, DEFAULT_PAGE_COPY.about.content),
  );

  return (
    <CmsPage
      title={title}
      label="The Mission"
      content={content}
      canEdit={canEdit}
      editHref="/admin/site?page=about"
      articleClassName="max-w-4xl mx-auto relative"
    />
  );
}
