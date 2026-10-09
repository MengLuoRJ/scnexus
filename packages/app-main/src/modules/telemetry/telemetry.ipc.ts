import { ipcHandle } from '../../utils/ipc-util'
import { updateSetting } from '../setting/setting'
import { getTelemetryStatus } from './telemetry'
export function initTelemetryIpc() {
  ipcHandle('telemetry:get-status', getTelemetryStatus)
  ipcHandle('telemetry:set-enabled', (enabled: unknown) =>
    updateSetting({ telemetryEnabled: enabled }),
  )
}
