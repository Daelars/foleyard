import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { CmsPage } from "@/components/cms-page";
import { isCurrentUserAdmin } from "@/lib/clerk-admin";
import { DEFAULT_PAGE_COPY } from "@/lib/site-copy";
import {
  normalizeSiteMarkdown,
  removeFounderBioBlock,
  useDefaultWhenLegacy,
} from "@/lib/site-defaults";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Founder",
  description: "Meet the creator behind Foleyard, Dalen (Dae).",
  alternates: { canonical: "/founder" },
};

export default async function FounderPage() {
  const canEdit = await isCurrentUserAdmin();
  const page = await fetchQuery(api.site.getPageBySlug, { slug: "founder" });

  const content = removeFounderBioBlock(
    normalizeSiteMarkdown(
      useDefaultWhenLegacy(page?.content, DEFAULT_PAGE_COPY.founder.content),
    ),
  );

  const displayTitle =
    page?.title === "The Founder"
      ? DEFAULT_PAGE_COPY.founder.title
      : page?.title || DEFAULT_PAGE_COPY.founder.title;

  return (
    <CmsPage
      title={displayTitle}
      label="Founder"
      content={content}
      canEdit={canEdit}
      editHref="/admin/site?page=founder"
      wrap
      titleSpacing
      variant="founder"
    />
  );
}
