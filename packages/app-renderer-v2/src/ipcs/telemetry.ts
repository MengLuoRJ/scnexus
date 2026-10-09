import { desktop, request, subscription } from './internal/ipc-common'
import type { DesktopApi } from '@scnexus/app-shared/types/desktop.type'

export const apiTelemetryGetStatus = () => request(() => desktop().telemetry.getStatus())
export const apiTelemetrySetEnabled = (value: boolean) =>
  request(() => desktop().telemetry.setEnabled(value))
export const apiTelemetryOnStatus = (
  listener: Parameters<DesktopApi['telemetry']['onStatus']>[0],
) => subscription((callback) => desktop().telemetry.onStatus(callback), listener)
