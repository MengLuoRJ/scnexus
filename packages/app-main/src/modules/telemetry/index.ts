import { initTelemetryIpc } from "./telemetry.ipc";
import { reportTelemetry } from "./telemetry";
import { setTelemetryReporter } from "../logging/logging";
export * from "./telemetry";
export function initTelemetryModule() {
  setTelemetryReporter(reportTelemetry);
  initTelemetryIpc();
}
