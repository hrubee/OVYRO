import * as Sentry from "@sentry/nextjs";

// No DSN (local dev, CI, preview) => init is a no-op and nothing is transmitted.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0.1,
  debug: false,
});
