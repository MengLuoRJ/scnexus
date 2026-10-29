import type { IpcResult } from '../errors/app.error.js'

export type AiAssistantStatus = {
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
  port: number
  errorCode?: string
}

export type AiOperationRecord = {
  id: string
  toolName: string
  status: 'running' | 'succeeded' | 'failed' | 'cancelled'
  startedAt: number
  finishedAt?: number
  errorCode?: string
}

export type AiConnectionInfo = {
  url: string
  token: string
}

export interface AiAssistantApi {
  getStatus(): Promise<IpcResult<AiAssistantStatus>>
  start(port: number): Promise<IpcResult<AiAssistantStatus>>
  stop(): Promise<IpcResult<AiAssistantStatus>>
  regenerateToken(): Promise<IpcResult<AiConnectionInfo>>
  getConnectionInfo(): Promise<IpcResult<AiConnectionInfo>>
  listRecords(): Promise<IpcResult<AiOperationRecord[]>>
  clearRecords(): Promise<IpcResult<Record<string, never>>>
  onStatusChanged(listener: (status: AiAssistantStatus) => void): () => void
  onRecordChanged(listener: (record: AiOperationRecord) => void): () => void
}
