import { NextResponse } from "next/server";

import {
  WAITLIST_ERROR_MESSAGE,
  WAITLIST_INVALID_MESSAGE,
  waitlistRequestSchema,
  waitlistResponseSchema,
} from "@/lib/waitlist-schema";

const convexWaitlistEndpoint = process.env.NEXT_PUBLIC_CONVEX_SITE_URL
  ? `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/api/waitlist`
  : null;

export async function POST(request: Request) {
  if (!convexWaitlistEndpoint) {
    return NextResponse.json(
      { status: "error", message: WAITLIST_ERROR_MESSAGE },
      { status: 500 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid", message: WAITLIST_INVALID_MESSAGE },
      { status: 400 },
    );
  }

  const parsed = waitlistRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "invalid", message: WAITLIST_INVALID_MESSAGE },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(convexWaitlistEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
    });

    const json: unknown = await response.json().catch(() => null);
    const validatedResponse = waitlistResponseSchema.safeParse(json);

    if (!validatedResponse.success) {
      return NextResponse.json(
        { status: "error", message: WAITLIST_ERROR_MESSAGE },
        { status: 500 },
      );
    }

    return NextResponse.json(validatedResponse.data, {
      status: response.status,
    });
  } catch {
    return NextResponse.json(
      { status: "error", message: WAITLIST_ERROR_MESSAGE },
      { status: 500 },
    );
  }
}
