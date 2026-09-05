import { NextResponse } from "next/server";

import {
  DOWNLOAD_ERROR_MESSAGE,
  DOWNLOAD_INVALID_MESSAGE,
  downloadSignupRequestSchema,
  downloadSignupResponseSchema,
} from "@/lib/download-schema";

const convexDownloadSignupEndpoint = process.env.NEXT_PUBLIC_CONVEX_SITE_URL
  ? `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/api/download-signup`
  : null;

export async function POST(request: Request) {
  if (!convexDownloadSignupEndpoint) {
    return NextResponse.json(
      { status: "error", message: DOWNLOAD_ERROR_MESSAGE },
      { status: 500 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid", message: DOWNLOAD_INVALID_MESSAGE },
      { status: 400 },
    );
  }

  const parsed = downloadSignupRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "invalid", message: DOWNLOAD_INVALID_MESSAGE },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(convexDownloadSignupEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
    });

    const json: unknown = await response.json().catch(() => null);
    const validatedResponse = downloadSignupResponseSchema.safeParse(json);

    if (!validatedResponse.success) {
      return NextResponse.json(
        { status: "error", message: DOWNLOAD_ERROR_MESSAGE },
        { status: 500 },
      );
    }

    return NextResponse.json(validatedResponse.data, {
      status: response.status,
    });
  } catch {
    return NextResponse.json(
      { status: "error", message: DOWNLOAD_ERROR_MESSAGE },
      { status: 500 },
    );
  }
}
