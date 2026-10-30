import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { CmsPage } from "@/components/cms-page";
import { isCurrentUserAdmin } from "@/lib/clerk-admin";
import {
  FOUNDER_MARKDOWN,
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
    normalizeSiteMarkdown(useDefaultWhenLegacy(page?.content, FOUNDER_MARKDOWN)),
  );

  const displayTitle = page?.title === "The Founder" ? "Why I Built Foleyard" : page?.title || "Why I Built Foleyard";

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
