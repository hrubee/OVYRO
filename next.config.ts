import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Media is served from R2/Mux; allow those hosts once the buckets exist (Wave 2+).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "image.mux.com" },
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
