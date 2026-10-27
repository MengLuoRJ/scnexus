import type {
  WorkshopApi,
  WorkshopSource,
  WorkshopUploadInput,
  WorkshopTask,
} from '@scnexus/app-shared/types/workshop.type'
import { ipcDesktop, ipcRequest, ipcSnapshot, ipcSubscription } from './internal/ipc-common'

const workshop = () => (ipcDesktop() as unknown as { workshop: WorkshopApi }).workshop
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
