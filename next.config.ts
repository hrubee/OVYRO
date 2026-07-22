import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * The local demo seed (scripts/seed-demo.ts) points listing media at
 * picsum.photos placeholders so browse/detail render a populated marketplace
 * without R2. Only allow-list these hosts outside production — real deployments
 * serve every image from R2/Mux and should never proxy an external placeholder.
 */
const demoImageHosts: RemotePattern[] =
  process.env.NODE_ENV === "production"
    ? []
    : [
        { protocol: "https", hostname: "picsum.photos" },
        { protocol: "https", hostname: "fastly.picsum.photos" },
      ];

const nextConfig: NextConfig = {
  // Media is served from R2/Mux; allow those hosts once the buckets exist (Wave 2+).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "image.mux.com" },
      ...demoImageHosts,
    ],
  },
};

// Sentry's build plugin only does work when a DSN + auth token are present.
// Without them this is a pass-through, which keeps local/CI builds dependency-free.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  disableLogger: true,
  telemetry: false,
});
