import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { CmsPage } from "@/components/cms-page";
import { isCurrentUserAdmin } from "@/lib/clerk-admin";
import {
  ABOUT_PAGE_MARKDOWN,
  stripLeadingMarkdownTitle,
  useDefaultWhenLegacy,
} from "@/lib/site-defaults";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about Foleyard, a local-first browser for messy sound libraries and audio folders.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const canEdit = await isCurrentUserAdmin();
  const page = await fetchQuery(api.site.getPageBySlug, { slug: "about" });

  const title = page?.title || "Foleyard: A Local-First Browser for Your Sound Library";
  const content = stripLeadingMarkdownTitle(
    useDefaultWhenLegacy(page?.content, ABOUT_PAGE_MARKDOWN),
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
