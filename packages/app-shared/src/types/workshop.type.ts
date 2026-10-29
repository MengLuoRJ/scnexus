import type { IpcResult } from '../errors/app.error.js'
import type { SourceInput } from './content.type.js'

export type WorkshopSource =
  | { kind: 'workshop'; versionId: string; projectScnid: number }
  | { kind: 'git'; repository: string; revision: string }
  | { kind: 'github'; repository: string; revision?: string }
export type WorkshopTaskStatus =
  | 'paused'
  | 'running'
  | 'completed'
  | 'failed'
  | 'unknown'
  | 'cancelled'
export interface WorkshopTask {
  taskId: string
  kind: 'download' | 'upload' | 'image'
  status: WorkshopTaskStatus
  name: string
  transferred: number
  size: number
  source?: WorkshopSource
  versionId?: string
  fileId?: string
  sessionId?: string
  sha256Source?: 'AUTHOR_DECLARED' | 'MANUALLY_VERIFIED'
  scanStatus?: string
  error?: string
  createdAt?: string
  completedAt?: string
  bytesPerSecond?: number
}
export interface WorkshopPackageSelection {
  selectionId: string
  name: string
  size: number
  sha256: string
  partMd5: string[]
  manifest: Record<string, unknown>
}
export interface WorkshopUploadInput {
  selectionId: string
  versionId: string
}
export interface WorkshopApi {
  openDownloadLocation(taskId?: string): Promise<IpcResult<void>>
  list(): Promise<IpcResult<WorkshopTask[]>>
  selectPackage(): Promise<IpcResult<WorkshopPackageSelection | null>>
  previewGithub(source: Extract<WorkshopSource, { kind: 'github' }>): Promise<
    IpcResult<{
      previewId: string
      source: WorkshopSource
      manifest: Record<string, unknown>
    }>
  >
  confirmGithub(previewId: string): Promise<IpcResult<WorkshopTask>>
  download(source: WorkshopSource): Promise<IpcResult<WorkshopTask>>
  inspectDownload(taskId: string): Promise<IpcResult<{ fileExists: boolean }>>
  removeDownload(taskId: string, deleteFile: boolean): Promise<IpcResult<void>>
  upload(input: WorkshopUploadInput): Promise<IpcResult<WorkshopTask>>
  selectImage(): Promise<IpcResult<WorkshopTask | null>>
  pause(taskId: string): Promise<IpcResult<void>>
  resume(taskId: string): Promise<IpcResult<WorkshopTask>>
  cancel(taskId: string): Promise<IpcResult<void>>
  installSource(taskId: string): Promise<IpcResult<SourceInput>>
  onChanged(listener: (task: WorkshopTask) => void): () => void
}
