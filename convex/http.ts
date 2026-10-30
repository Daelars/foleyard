import { httpRouter } from "convex/server";

import {
  WAITLIST_ERROR_MESSAGE,
  WAITLIST_INVALID_MESSAGE,
  WAITLIST_SUCCESS_MESSAGE,
  waitlistRequestSchema,
} from "../lib/waitlist-schema";
import {
  DOWNLOAD_ERROR_MESSAGE,
  DOWNLOAD_INVALID_MESSAGE,
  DOWNLOAD_SUCCESS_MESSAGE,
  downloadSignupRequestSchema,
} from "../lib/download-schema";
import {
  UNSUBSCRIBE_INVALID_MESSAGE,
  UNSUBSCRIBE_RATE_LIMITED_MESSAGE,
  UNSUBSCRIBE_SUCCESS_MESSAGE,
  UNSUBSCRIBE_UNAVAILABLE_MESSAGE,
  unsubscribeTokenSchema,
} from "../lib/unsubscribe-schema";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

// The Next route forwards the visitor's address in x-foleyard-client-ip; without
// it Convex would only see the Next server's own IP and rate-limit everyone together.
function getClientIp(request: Request) {
  return (
    request.headers.get("x-foleyard-client-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("fly-client-ip") ||
    "unknown"
  );
}

// Same salt as the signup routes, so the rate-limit key cannot be reversed into
// an address. Web Crypto keeps this endpoint in the default runtime.
async function hashIpAddress(ipAddress: string) {
  const salt =
    process.env.WAITLIST_IP_HASH_SALT ??
    process.env.CONVEX_DEPLOYMENT ??
    "foleyard-waitlist";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${ipAddress}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Mail clients send the RFC 8058 one-click POST with a form body and the token
// in the URL; the site page posts JSON. Read both, and never trust either.
async function readUnsubscribeToken(request: Request) {
  const fromQuery = new URL(request.url).searchParams.get("token");
  if (fromQuery) return fromQuery;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      const payload: unknown = await request.json();
      if (
        payload &&
        typeof payload === "object" &&
        "token" in payload &&
        typeof (payload as { token?: unknown }).token === "string"
      ) {
        return (payload as { token: string }).token;
      }
    } catch {
      return "";
    }
    return "";
  }

  if (
    contentType
      .toLowerCase()
      .includes("application/x-www-form-urlencoded")
  ) {
    try {
      const body = await request.text();
      return new URLSearchParams(body).get("token") ?? "";
    } catch {
      return "";
    }
  }

  return "";
}

http.route({
  path: "/api/waitlist",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonResponse(
        { status: "invalid", message: WAITLIST_INVALID_MESSAGE },
        400,
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(
        { status: "invalid", message: WAITLIST_INVALID_MESSAGE },
        400,
      );
    }

    const parsed = waitlistRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonResponse(
        { status: "invalid", message: WAITLIST_INVALID_MESSAGE },
        400,
      );
    }

    const ipAddress = getClientIp(request);

    const userAgent = request.headers.get("user-agent") ?? "";

    try {
      await ctx.runAction(internal.waitlistHttp.handleSubmission, {
        email: parsed.data.email,
        source: parsed.data.source,
        website: parsed.data.website,
        ipAddress,
        userAgent,
      });

      return jsonResponse(
        { status: "success", message: WAITLIST_SUCCESS_MESSAGE },
        200,
      );
    } catch {
      return jsonResponse(
        { status: "error", message: WAITLIST_ERROR_MESSAGE },
        500,
      );
    }
  }),
});

http.route({
  path: "/api/download-signup",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonResponse(
        { status: "invalid", message: DOWNLOAD_INVALID_MESSAGE },
        400,
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(
        { status: "invalid", message: DOWNLOAD_INVALID_MESSAGE },
        400,
      );
    }

    const parsed = downloadSignupRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonResponse(
        { status: "invalid", message: DOWNLOAD_INVALID_MESSAGE },
        400,
      );
    }

    const ipAddress = getClientIp(request);

    const userAgent = request.headers.get("user-agent") ?? "";

    try {
      await ctx.runAction(internal.downloadSignupHttp.handleSubmission, {
        email: parsed.data.email,
        source: parsed.data.source,
        website: parsed.data.website,
        ipAddress,
        userAgent,
      });

      return jsonResponse(
        { status: "success", message: DOWNLOAD_SUCCESS_MESSAGE },
        200,
      );
    } catch {
      return jsonResponse(
        { status: "error", message: DOWNLOAD_ERROR_MESSAGE },
        500,
      );
    }
  }),
});

// Confirmation only: a GET never records an opt-out, so a link scanner that
// follows the URL cannot unsubscribe the recipient. It also does not look at
// any signup, so it cannot be used to test whether an address exists.
http.route({
  path: "/api/unsubscribe",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const rawToken = new URL(request.url).searchParams.get("token") ?? "";
    const parsed = unsubscribeTokenSchema.safeParse(rawToken);
    if (!parsed.success) {
      return jsonResponse(
        { status: "invalid", message: UNSUBSCRIBE_INVALID_MESSAGE },
        400,
      );
    }

    const result = await ctx.runQuery(
      internal.unsubscribe.checkUnsubscribeToken,
      { token: parsed.data },
    );

    if (result.status === "valid") {
      return jsonResponse({ status: "valid", list: result.list }, 200);
    }
    if (result.status === "unavailable") {
      return jsonResponse(
        { status: "unavailable", message: UNSUBSCRIBE_UNAVAILABLE_MESSAGE },
        503,
      );
    }
    return jsonResponse(
      { status: "invalid", message: UNSUBSCRIBE_INVALID_MESSAGE },
      400,
    );
  }),
});

// Both the one-click POST from a mail client and the button on /unsubscribe
// land here. A valid token is the only way to write an opt-out.
http.route({
  path: "/api/unsubscribe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawToken = await readUnsubscribeToken(request);
    const parsed = unsubscribeTokenSchema.safeParse(rawToken);
    if (!parsed.success) {
      return jsonResponse(
        { status: "invalid", message: UNSUBSCRIBE_INVALID_MESSAGE },
        400,
      );
    }

    const ipHash = await hashIpAddress(getClientIp(request));

    const result = await ctx.runMutation(
      internal.unsubscribe.unsubscribeWithToken,
      { token: parsed.data, ipHash },
    );

    if (result.status === "unsubscribed") {
      return jsonResponse(
        { status: "unsubscribed", message: UNSUBSCRIBE_SUCCESS_MESSAGE },
        200,
      );
    }
    if (result.status === "rate_limited") {
      return jsonResponse(
        { status: "rate_limited", message: UNSUBSCRIBE_RATE_LIMITED_MESSAGE },
        429,
      );
    }
    if (result.status === "unavailable") {
      return jsonResponse(
        { status: "unavailable", message: UNSUBSCRIBE_UNAVAILABLE_MESSAGE },
        503,
      );
    }
    return jsonResponse(
      { status: "invalid", message: UNSUBSCRIBE_INVALID_MESSAGE },
      400,
    );
  }),
});

export default http;
