import { NextResponse } from "next/server";

import { getForwardedClientIpHeaders } from "@/lib/client-ip";
import {
  UNSUBSCRIBE_INVALID_MESSAGE,
  UNSUBSCRIBE_UNAVAILABLE_MESSAGE,
  unsubscribeResponseSchema,
  unsubscribeTokenSchema,
} from "@/lib/unsubscribe-schema";

const convexUnsubscribeEndpoint = process.env.NEXT_PUBLIC_CONVEX_SITE_URL
  ? `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/api/unsubscribe`
  : null;

function unavailable() {
  return NextResponse.json(
    { status: "unavailable", message: UNSUBSCRIBE_UNAVAILABLE_MESSAGE },
    { status: 503 },
  );
}

function invalid() {
  return NextResponse.json(
    { status: "invalid", message: UNSUBSCRIBE_INVALID_MESSAGE },
    { status: 400 },
  );
}

// Confirmation check for the /unsubscribe page. It never opts anybody out, so a
// link scanner that follows the URL is harmless.
export async function GET(request: Request) {
  if (!convexUnsubscribeEndpoint) return unavailable();

  const token = new URL(request.url).searchParams.get("token") ?? "";
  const parsed = unsubscribeTokenSchema.safeParse(token);
  if (!parsed.success) return invalid();

  try {
    const response = await fetch(
      `${convexUnsubscribeEndpoint}?token=${encodeURIComponent(parsed.data)}`,
      { cache: "no-store" },
    );

    const json: unknown = await response.json().catch(() => null);
    if (
      json &&
      typeof json === "object" &&
      "status" in json &&
      (json as { status?: unknown }).status === "valid"
    ) {
      return NextResponse.json(
        { status: "valid" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (
      json &&
      typeof json === "object" &&
      "status" in json &&
      (json as { status?: unknown }).status === "unavailable"
    ) {
      return unavailable();
    }
  } catch {
    return unavailable();
  }

  return invalid();
}

// Forwards the RFC 8058 one-click POST (and the page button) to Convex, so the
// List-Unsubscribe URL can live on the public site and the client never talks
// to the deployment URL directly.
export async function POST(request: Request) {
  if (!convexUnsubscribeEndpoint) return unavailable();

  let token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) {
    try {
      const payload: unknown = await request.json();
      if (
        payload &&
        typeof payload === "object" &&
        "token" in payload &&
        typeof (payload as { token?: unknown }).token === "string"
      ) {
        token = (payload as { token: string }).token;
      }
    } catch {
      // A mail client's form body has the token in the URL, not the body.
    }
  }

  const parsed = unsubscribeTokenSchema.safeParse(token);
  if (!parsed.success) return invalid();

  try {
    const response = await fetch(
      `${convexUnsubscribeEndpoint}?token=${encodeURIComponent(parsed.data)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": request.headers.get("user-agent") ?? "",
          // A valid token is never rate-limited, so this bucket only matters
          // for invalid attempts. Replace this call with PR #13's signed
          // `getClientIpHeaders` when it lands.
          ...getForwardedClientIpHeaders(request),
        },
        body: "List-Unsubscribe=One-Click",
        cache: "no-store",
      },
    );

    const json: unknown = await response.json().catch(() => null);
    const validated = unsubscribeResponseSchema.safeParse(json);

    if (!validated.success) {
      return unavailable();
    }

    return NextResponse.json(validated.data, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return unavailable();
  }
}
