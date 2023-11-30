import * as Sentry from "@sentry/electron/main";

export function initSentry() {
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN });
}
