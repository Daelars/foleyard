import { NextResponse } from "next/server";

import { getClientIp } from "@/lib/client-ip";

const convexDownloadEndpoint = process.env.NEXT_PUBLIC_CONVEX_SITE_URL
  ? `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/api/download`
  : null;

export async function POST(request: Request) {
  if (!convexDownloadEndpoint) {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  const clientIp = getClientIp(request);

  try {
    const response = await fetch(convexDownloadEndpoint, {
      method: "POST",
      headers: {
        "User-Agent": request.headers.get("user-agent") ?? "",
        ...(clientIp ? { "x-foleyard-client-ip": clientIp } : {}),
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
