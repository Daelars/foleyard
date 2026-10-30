import {
  ABOUT_PAGE_MARKDOWN,
  CONTACT_MARKDOWN,
  FOUNDER_MARKDOWN,
  TEAM_MARKDOWN,
} from "@/lib/site-defaults";

export const editablePageSlugs = ["about", "founder", "founders", "team", "contact"] as const;
export type EditablePageSlug = (typeof editablePageSlugs)[number];

export function isEditablePageSlug(value: string | null | undefined): value is EditablePageSlug {
  return editablePageSlugs.includes(value as EditablePageSlug);
}

export const defaultPageCopy: Record<EditablePageSlug, { title: string; content: string }> = {
  about: {
    title: "Foleyard: A Local-First Browser for Your Sound Library",
    content: ABOUT_PAGE_MARKDOWN,
  },
  founder: {
    title: "Why I Built Foleyard",
    content: FOUNDER_MARKDOWN,
  },
  founders: {
    title: "Why I Built Foleyard",
    content: FOUNDER_MARKDOWN,
  },
  team: {
    title: "Currently built by one person.",
    content: TEAM_MARKDOWN,
  },
  contact: {
    title: "Get in Touch",
    content: CONTACT_MARKDOWN,
  },
};
