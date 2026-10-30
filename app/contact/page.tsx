import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { CmsPage } from "@/components/cms-page";
import { isCurrentUserAdmin } from "@/lib/clerk-admin";
import { DEFAULT_PAGE_COPY } from "@/lib/site-copy";
import { useDefaultWhenLegacy } from "@/lib/site-defaults";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Foleyard about feedback, testing, and the local-first audio browser.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const canEdit = await isCurrentUserAdmin();
  const page = await fetchQuery(api.site.getPageBySlug, { slug: "contact" });

  const title = page?.title || DEFAULT_PAGE_COPY.contact.title;
  const content = useDefaultWhenLegacy(page?.content, DEFAULT_PAGE_COPY.contact.content);

  return (
    <CmsPage
      title={title}
      label="Contact"
      content={content}
      canEdit={canEdit}
      editHref="/admin/site?page=contact"
      titleSpacing
    />
  );
}
