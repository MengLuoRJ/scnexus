import type {
  WorkshopApi,
  WorkshopSource,
  WorkshopUploadInput,
  WorkshopTask,
} from '@scnexus/app-shared/types/workshop.type'
import { ipcDesktop, ipcRequest, ipcSnapshot, ipcSubscription } from './internal/ipc-common'

const workshop = () => (ipcDesktop() as unknown as { workshop: WorkshopApi }).workshop
export const ipcWorkshopPreviewGithub = (source: Extract<WorkshopSource, { kind: 'github' }>) =>
  ipcRequest(() => workshop().previewGithub(ipcSnapshot(source)))
export const ipcWorkshopConfirmGithub = (previewId: string) =>
  ipcRequest(() => workshop().confirmGithub(previewId))
export const ipcWorkshopInspectDownload = (taskId: string) =>
  ipcRequest(() => workshop().inspectDownload(taskId))
export const ipcWorkshopRemoveDownload = (taskId: string, deleteFile: boolean) =>
  ipcRequest(() => workshop().removeDownload(taskId, deleteFile))
export const ipcWorkshopOpenDownloadLocation = (taskId?: string) =>
  ipcRequest(() => workshop().openDownloadLocation(taskId))
export const ipcWorkshopList = () => ipcRequest(() => workshop().list())
export const ipcWorkshopSelectPackage = () => ipcRequest(() => workshop().selectPackage())
export const ipcWorkshopDownload = (source: WorkshopSource) =>
  ipcRequest(() => workshop().download(ipcSnapshot(source)))
export const ipcWorkshopUpload = (input: WorkshopUploadInput) =>
  ipcRequest(() => workshop().upload(ipcSnapshot(input)))
export const ipcWorkshopSelectImage = () => ipcRequest(() => workshop().selectImage())
export const ipcWorkshopPause = (taskId: string) => ipcRequest(() => workshop().pause(taskId))
export const ipcWorkshopResume = (taskId: string) => ipcRequest(() => workshop().resume(taskId))
export const ipcWorkshopCancel = (taskId: string) => ipcRequest(() => workshop().cancel(taskId))
export const ipcWorkshopInstallSource = (taskId: string) =>
  ipcRequest(() => workshop().installSource(taskId))
export const ipcWorkshopOnChanged = (listener: (task: WorkshopTask) => void) =>
  ipcSubscription((callback) => workshop().onChanged(callback), listener)
