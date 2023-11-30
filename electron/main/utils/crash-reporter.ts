import { crashReporter } from "electron";

export function exportCrashReporter() {
  crashReporter.start({
    submitURL: import.meta.env.VITE_SENTRY_SUBMIT_URL,
  });
}
