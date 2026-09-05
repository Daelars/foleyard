import { NextResponse } from "next/server";

import { getPostHogServerClient } from "@/lib/posthog-server";

const GITHUB_API =
  "https://api.github.com/repos/Daelars/foleyard-v2/releases/latest";
const FALLBACK_URL =
  "https://github.com/Daelars/foleyard-v2/releases/latest";

export async function GET() {
  try {
    const response = await fetch(GITHUB_API, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });

    if (!response.ok) {
      return NextResponse.json({ url: FALLBACK_URL });
    }

    const data = await response.json();
    const asset = data.assets?.[0];
    const url = asset?.browser_download_url ?? data.html_url ?? FALLBACK_URL;

    try {
      getPostHogServerClient()?.capture({
        distinctId: "server",
        event: "release_checked",
      });
    } catch {
      // Analytics must never break the route.
    }

    return NextResponse.json(
      { url },
      {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=300",
        },
      },
    );
  } catch {
    return NextResponse.json({ url: FALLBACK_URL });
  }
}
