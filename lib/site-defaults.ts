import { FOUNDER_PROFILE_IMAGE, LEGACY_PLACEHOLDERS } from "./site-copy";

export function useDefaultWhenLegacy(
  content: string | null | undefined,
  fallback: string,
) {
  if (!content || LEGACY_PLACEHOLDERS.includes(content.trim())) {
    return fallback;
  }

  return content;
}

export function normalizeSiteMarkdown(content: string) {
  return content.replaceAll("/about-me/profile_picture.png", FOUNDER_PROFILE_IMAGE);
}

export function removeFounderBioBlock(content: string) {
  return content
    .replace(
      /\n---\s*\n+Hi! I'm Dalen, or Dae\.[\s\S]*?!\[Dalen\]\((?:\/about-me\/profile_picture\.(?:png|jpeg))\)\s*$/m,
      "",
    )
    .replace(
      /\n+Hi! I'm Dalen, or Dae\.[^\n]*\n+\!\[Dalen\]\((?:\/about-me\/profile_picture\.(?:png|jpeg))\)\s*$/m,
      "",
    );
}

export function removeTeamBioLine(content: string) {
  return content.replace(/\n*Hi! I'm Dalen, or Dae\.[^\n]*$/m, "");
}

export function stripLeadingMarkdownTitle(content: string) {
  return content.replace(/^# .+\n+/, "");
}
