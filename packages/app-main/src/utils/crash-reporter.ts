import { crashReporter } from "electron";

export function exportCrashReporter() {
  crashReporter.start({
    companyName: "aiurcovenant",
    productName: "scnexus",
    ignoreSystemCrashHandler: true,
    submitURL: import.meta.env.VITE_SENTRY_SUBMIT_URL,
  });
}
