import type {
  AiAssistantStatus,
  AiOperationRecord,
} from '@scnexus/app-shared/types/ai-assistant.type'
import { ipcDesktop, ipcRequest, ipcSubscription } from './internal/ipc-common'

const aiAssistant = () => ipcDesktop().aiAssistant
export const ipcAiAssistantGetStatus = () => ipcRequest(() => aiAssistant().getStatus())
export const ipcAiAssistantStart = (port: number) => ipcRequest(() => aiAssistant().start(port))
export const ipcAiAssistantStop = () => ipcRequest(() => aiAssistant().stop())
export const ipcAiAssistantRegenerateToken = () => ipcRequest(() => aiAssistant().regenerateToken())
export const ipcAiAssistantGetConnectionInfo = () =>
  ipcRequest(() => aiAssistant().getConnectionInfo())
export const ipcAiAssistantListRecords = () => ipcRequest(() => aiAssistant().listRecords())
export const ipcAiAssistantClearRecords = () => ipcRequest(() => aiAssistant().clearRecords())
export const ipcAiAssistantOnStatusChanged = (listener: (status: AiAssistantStatus) => void) =>
  ipcSubscription((callback) => aiAssistant().onStatusChanged(callback), listener)
export const ipcAiAssistantOnRecordChanged = (listener: (record: AiOperationRecord) => void) =>
  ipcSubscription((callback) => aiAssistant().onRecordChanged(callback), listener)
