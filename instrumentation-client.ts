import * as Sentry from "@sentry/nextjs";

// Client DSN must be NEXT_PUBLIC_* to survive the browser bundle.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0.1,
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
