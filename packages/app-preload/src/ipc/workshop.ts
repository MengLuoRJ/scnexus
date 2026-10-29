import type { WorkshopApi } from '@scnexus/app-shared/types/workshop.type'
import { invoke, subscribeTyped } from '../ipc-common.js'

export const workshopApi: WorkshopApi = {
  openDownloadLocation: (taskId) =>
    taskId === undefined
      ? invoke('workshop:open-download-location')
      : invoke('workshop:open-download-location', taskId),
  list: () => invoke('workshop:list'),
  selectPackage: () => invoke('workshop:select-package'),
  previewGithub: (source) => invoke('workshop:preview-github', source),
  confirmGithub: (previewId) => invoke('workshop:confirm-github', previewId),
  download: (source) => invoke('workshop:download', source),
  inspectDownload: (taskId) => invoke('workshop:inspect-download', taskId),
  removeDownload: (taskId, deleteFile) => invoke('workshop:remove-download', taskId, deleteFile),
  upload: (input) => invoke('workshop:upload', input),
  selectImage: () => invoke('workshop:select-image'),
  pause: (taskId) => invoke('workshop:pause', taskId),
  resume: (taskId) => invoke('workshop:resume', taskId),
  cancel: (taskId) => invoke('workshop:cancel', taskId),
  installSource: (taskId) => invoke('workshop:install-source', taskId),
  onChanged: (listener) => subscribeTyped('workshop:changed', listener),
}
