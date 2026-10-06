import { app } from "electron";
import * as Sentry from "@sentry/electron/main";
import {
  AppError,
  ERRORS,
  type AppErrorDto,
} from "@scnexus/app-shared/errors/app.error";
import type { TelemetryStatus } from "@scnexus/app-shared/types/desktop.type";
import { redact } from "../logging/logging";
import { getMainWindow } from "../window/window";

let status: TelemetryStatus = { savedEnabled: false, state: "disabled" };
let canSend = false;
let session = 0;
export function setSavedTelemetryEnabled(enabled: boolean) {
  status.savedEnabled = enabled;
  publish();
}
export function getTelemetryStatus(): TelemetryStatus {
  return { ...status };
}
function publish() {
  getMainWindow()?.webContents.send("telemetry:status", getTelemetryStatus());
}

export function enableTelemetry(clientId: string) {
  status = { savedEnabled: true, state: "starting" };
  publish();
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!app.isPackaged || !dsn) {
    status.state = "failed";
    publish();
    throw new AppError(ERRORS.TELEMETRY_INITIALIZATION_FAILED, {
      message: "Telemetry is unavailable in this environment",
    });
  }
  if (canSend) {
    status.state = "enabled";
    publish();
    return;
  }
  const generation = ++session;
  try {
    Sentry.init({
      dsn,
      defaultIntegrations: false,
      maxBreadcrumbs: 0,
      transport(options) {
        const transport = Sentry.makeElectronTransport(options);
        return {
          send(envelope) {
            return canSend && generation === session
              ? transport.send(envelope)
              : Promise.resolve({});
          },
          flush(timeout) {
            return canSend && generation === session
              ? transport.flush(timeout)
              : Promise.resolve(true);
          },
        };
      },
      beforeSend(event) {
        if (!canSend || generation !== session) return null;
        delete event.request;
        delete event.breadcrumbs;
        delete event.contexts;
        delete event.extra;
        event.message = event.message ? redact(event.message) : undefined;
        return event;
      },
    });
    Sentry.setUser({ id: clientId });
    canSend = true;
    status.state = "enabled";
    publish();
  } catch (cause) {
    canSend = false;
    session++;
    status.state = "failed";
    publish();
    throw new AppError(ERRORS.TELEMETRY_INITIALIZATION_FAILED, {}, { cause });
  }
}

export async function disableTelemetry(savedEnabled = false) {
  canSend = false;
  session++;
  status = { savedEnabled, state: "disabled" };
  publish();
  try {
    Sentry.setUser(null);
    const client = Sentry.getClient();
    if (client) await client.close(0);
  } catch (cause) {
    throw new AppError(ERRORS.TELEMETRY_DISABLE_FAILED, {}, { cause });
  }
}
const reportedIds = new Set<string>();
export function reportTelemetry(error: {
  code: string;
  name: string;
  errorId: string;
  message?: string;
  taskId?: string;
}) {
  if (!canSend || reportedIds.has(error.errorId)) return;
  reportedIds.add(error.errorId);
  if (reportedIds.size > 1000)
    reportedIds.delete(reportedIds.values().next().value!);
  Sentry.captureMessage(redact(error.message || error.name), {
    level: "error",
    tags: { code: error.code, errorName: error.name, errorId: error.errorId },
  });
}
export function setSentryUser(_user: unknown) {
  // The installation identity is owned by setting; legacy login callbacks cannot change consent or identity.
}
export function reportRendererError(error: AppErrorDto) {
  reportTelemetry(error);
}
