import { NextResponse } from "next/server";

import { getClientIp } from "@/lib/client-ip";
import {
  SIGNUP_ERROR_MESSAGE,
  SIGNUP_INVALID_MESSAGE,
  SIGNUPS,
  signupRequestSchemas,
  signupResponseSchema,
  type SignupKind,
} from "@/lib/signup-schema";

export function createSignupRoute(kind: SignupKind) {
  const convexEndpoint = process.env.NEXT_PUBLIC_CONVEX_SITE_URL
    ? `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}${SIGNUPS[kind].path}`
    : null;
  const requestSchema = signupRequestSchemas[kind];

  return async function POST(request: Request) {
    if (!convexEndpoint) {
      return NextResponse.json(
        { status: "error", message: SIGNUP_ERROR_MESSAGE },
        { status: 500 },
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { status: "invalid", message: SIGNUP_INVALID_MESSAGE },
        { status: 400 },
      );
    }

    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "invalid", message: SIGNUP_INVALID_MESSAGE },
        { status: 400 },
      );
    }

    const clientIp = getClientIp(request);

    try {
      const response = await fetch(convexEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": request.headers.get("user-agent") ?? "",
          ...(clientIp ? { "x-foleyard-client-ip": clientIp } : {}),
        },
        body: JSON.stringify(parsed.data),
        cache: "no-store",
      });

      const json: unknown = await response.json().catch(() => null);
      const validatedResponse = signupResponseSchema.safeParse(json);

      if (!validatedResponse.success) {
        return NextResponse.json(
          { status: "error", message: SIGNUP_ERROR_MESSAGE },
          { status: 500 },
        );
      }

      return NextResponse.json(validatedResponse.data, {
        status: response.status,
      });
    } catch {
      return NextResponse.json(
        { status: "error", message: SIGNUP_ERROR_MESSAGE },
        { status: 500 },
      );
    }
  };
}
