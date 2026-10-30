import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const POSTHOG_ASSETS_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_ASSETS_HOST ??
  "https://us-assets.i.posthog.com";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: projectRoot,
  },
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        // The confirmation URL carries a signed recipient token. Never send it
        // as a referrer and never let a proxy cache it.
        source: "/unsubscribe",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/fy-ingest/static/:path*",
        destination: `${POSTHOG_ASSETS_HOST}/static/:path*`,
      },
      {
        source: "/fy-ingest/:path*",
        destination: `${POSTHOG_HOST}/:path*`,
      },
    ];
  },
};

export default nextConfig;
