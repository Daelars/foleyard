import posthog, { type CaptureResult } from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

// Unsubscribe links carry the signed token (and can carry an address) in the
// query string. Every captured URL is scrubbed before it leaves the browser so
// a per-recipient link never lands in analytics.
const SENSITIVE_QUERY_PARAMS = new Set(["token", "email", "address", "e"]);

function isSensitiveParam(name: string) {
  const lower = name.toLowerCase();
  return (
    SENSITIVE_QUERY_PARAMS.has(lower) ||
    lower.includes("email") ||
    lower.includes("address")
  );
}

function scrubUrl(value: string): string {
  const relative = /^\/(?!\/)/.test(value);
  const queryOnly = value.startsWith("?");
  if (!/^(https?:\/\/|\/|\?)/i.test(value)) return value;

  let url: URL;
  try {
    url = new URL(
      value,
      (globalThis as { location?: { origin?: string } }).location?.origin ??
        "http://localhost",
    );
  } catch {
    return value;
  }

  let changed = false;
  for (const key of [...url.searchParams.keys()]) {
    if (!isSensitiveParam(key)) continue;
    url.searchParams.delete(key);
    changed = true;
  }
  if (!changed) return value;

  if (relative) return `${url.pathname}${url.search}${url.hash}`;
  if (queryOnly) return `${url.search}${url.hash}`;
  return url.toString();
}

function sanitizeEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null;

  const properties = { ...event.properties };
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value !== "string") continue;
    properties[key] = scrubUrl(value);
  }

  return { ...event, properties };
}

if (token) {
  posthog.init(token, {
    api_host: "/fy-ingest",
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: "2026-05-30",
    before_send: sanitizeEvent,
  });
}
