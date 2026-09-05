import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Foleyard - Find the right sound before the idea disappears",
    short_name: "Foleyard",
    description:
      "A local-first browser for messy SFX folders, music cues, and massive audio libraries.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0a09",
    theme_color: "#0c0a09",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      {
        src: "/app_preview.png",
        sizes: "1200x630",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
