import posthog from "posthog-js";

export function track(event: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    posthog.capture(event, props);
  } catch {
    // Analytics must never break the app.
  }
}

export function identify(email: string) {
  if (typeof window === "undefined") return;
  try {
    posthog.identify(email.trim().toLowerCase());
  } catch {
    // Analytics must never break the app.
  }
}
