import { httpRouter } from "convex/server";

import {
  SIGNUP_ERROR_MESSAGE,
  SIGNUP_INVALID_MESSAGE,
  SIGNUP_KINDS,
  SIGNUPS,
  signupRequestSchemas,
} from "../lib/signup-schema";
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

for (const kind of SIGNUP_KINDS) {
  const { path, successMessage } = SIGNUPS[kind];
  const requestSchema = signupRequestSchemas[kind];

  http.route({
    path,
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        return jsonResponse(
          { status: "invalid", message: SIGNUP_INVALID_MESSAGE },
          400,
        );
      }

      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse(
          { status: "invalid", message: SIGNUP_INVALID_MESSAGE },
          400,
        );
      }

      const parsed = requestSchema.safeParse(payload);
      if (!parsed.success) {
        return jsonResponse(
          { status: "invalid", message: SIGNUP_INVALID_MESSAGE },
          400,
        );
      }

      const ipAddress = getClientIp(request);

      const userAgent = request.headers.get("user-agent") ?? "";

      try {
        await ctx.runAction(internal.signupHttp.handleSubmission, {
          kind,
          email: parsed.data.email,
          website: parsed.data.website,
          ipAddress,
          userAgent,
        });

        return jsonResponse({ status: "success", message: successMessage }, 200);
      } catch {
        return jsonResponse(
          { status: "error", message: SIGNUP_ERROR_MESSAGE },
          500,
        );
      }
    }),
  });
}

export default http;
