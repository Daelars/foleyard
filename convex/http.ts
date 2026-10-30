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
import { CLIENT_IP_HEADER, CLIENT_IP_SECRET_HEADER } from "../lib/client-ip";
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

// Compares without an early exit so the time taken does not reveal which part of
// the secret matched. A shorter value reads NaN past its end, which bitwise
// operators coerce to 0, so the length difference still shows up in `difference`.
function secretsMatch(presented: string, expected: string) {
  let difference = presented.length ^ expected.length;
  const length = Math.max(presented.length, expected.length);

  for (let index = 0; index < length; index += 1) {
    difference |= presented.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return difference === 0;
}

// The Next route forwards the visitor's address in x-foleyard-client-ip; without
// it Convex would only see the Next server's own IP and rate-limit everyone together.
// That header is only honoured when it arrives with our shared secret. With a
// secret configured, a request that fails the check gets one fixed bucket and no
// client-controlled header is read, so direct callers cannot rotate their key.
function getClientIp(request: Request) {
  const secret = process.env.FOLEYARD_CLIENT_IP_SECRET;

  if (secret) {
    const presentedSecret = request.headers.get(CLIENT_IP_SECRET_HEADER);

    if (!presentedSecret || !secretsMatch(presentedSecret, secret)) {
      return "direct";
    }

    return request.headers.get(CLIENT_IP_HEADER) || "direct";
  }

  // No secret configured yet: keep the old best-effort fallback behaviour.
  return (
    request.headers.get(CLIENT_IP_HEADER) ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("fly-client-ip") ||
    "unknown"
  );
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
  path: "/api/download",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const ipAddress = getClientIp(request);

    try {
      await ctx.runAction(internal.downloadsHttp.handleDownload, { ipAddress });

      return jsonResponse({ status: "success" }, 200);
    } catch {
      return jsonResponse({ status: "error" }, 500);
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

export default http;
