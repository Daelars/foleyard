export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://foleyard.com";

export const SITE_KEYWORDS = [
  "sound effects browser",
  "SFX organizer",
  "local-first audio browser",
  "sample library manager",
  "music cues",
  "sound design workflow",
  "video editor SFX",
  "game audio assets",
  "foley library",
];

export const PUBLIC_ROUTES = [
  { path: "", changeFrequency: "weekly" as const, priority: 1 },
  { path: "/about", changeFrequency: "monthly" as const, priority: 0.8 },
  { path: "/blog", changeFrequency: "weekly" as const, priority: 0.8 },
  { path: "/contact", changeFrequency: "yearly" as const, priority: 0.5 },
  { path: "/founder", changeFrequency: "yearly" as const, priority: 0.5 },
  { path: "/founders", changeFrequency: "yearly" as const, priority: 0.4 },
  { path: "/team", changeFrequency: "yearly" as const, priority: 0.5 },
];
