import { ipcDesktop, ipcRequest, ipcSubscription } from './internal/ipc-common'
import type { DesktopApi } from '@scnexus/app-shared/types/desktop.type'

export const ipcTelemetryGetStatus = () => ipcRequest(() => ipcDesktop().telemetry.getStatus())
export const ipcTelemetrySetEnabled = (value: boolean) =>
  ipcRequest(() => ipcDesktop().telemetry.setEnabled(value))
export const ipcTelemetryOnStatus = (
  listener: Parameters<DesktopApi['telemetry']['onStatus']>[0],
) => ipcSubscription((callback) => ipcDesktop().telemetry.onStatus(callback), listener)
