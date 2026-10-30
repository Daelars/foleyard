import { NextResponse } from "next/server";

import { getClientIpHeaders } from "@/lib/client-ip";

const convexDownloadEndpoint = process.env.NEXT_PUBLIC_CONVEX_SITE_URL
  ? `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/api/download`
  : null;

export async function POST(request: Request) {
  if (!convexDownloadEndpoint) {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  try {
    const response = await fetch(convexDownloadEndpoint, {
      method: "POST",
      headers: {
        "User-Agent": request.headers.get("user-agent") ?? "",
        // Convex only trusts the forwarded address when it arrives with the
        // shared secret; without it every download looks like one visitor.
        ...getClientIpHeaders(request),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ status: "error" }, { status: 502 });
    }

    return NextResponse.json({ status: "success" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
