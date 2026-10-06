import { ipcHandleTyped } from "../../utils/ipc-util";
import { updateSetting } from "../setting/setting";
import { getTelemetryStatus } from "./telemetry";
export function initTelemetryIpc() {
  ipcHandleTyped("telemetry:get-status", getTelemetryStatus);
  ipcHandleTyped("telemetry:set-enabled", (enabled: unknown) =>
    updateSetting({ telemetryEnabled: enabled }),
  );
}
