import { httpRouter } from "convex/server";

import {
  WAITLIST_ERROR_MESSAGE,
  WAITLIST_INVALID_MESSAGE,
  WAITLIST_SUCCESS_MESSAGE,
  waitlistRequestSchema,
} from "../lib/waitlist-schema";
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

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("fly-client-ip") ||
      "unknown";

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

export default http;
