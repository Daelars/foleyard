import { PostHog } from "posthog-node";

let client: PostHog | null | undefined;

export function getPostHogServerClient(): PostHog | null {
  if (client !== undefined) return client;

  const apiKey =
    process.env.POSTHOG_PROJECT_TOKEN ??
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host =
    process.env.POSTHOG_HOST ?? process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!apiKey) {
    client = null;
    return client;
  }

  client = new PostHog(apiKey, {
    host: host ?? "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}
