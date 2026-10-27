import type { WorkshopApi } from '@scnexus/app-shared/types/workshop.type'
import { invoke, subscribeTyped } from '../ipc-common.js'

export const workshopApi: WorkshopApi = {
  list: () => invoke('workshop:list'),
  selectPackage: () => invoke('workshop:select-package'),
  download: (source) => invoke('workshop:download', source),
  upload: (input) => invoke('workshop:upload', input),
  selectImage: () => invoke('workshop:select-image'),
  pause: (taskId) => invoke('workshop:pause', taskId),
  resume: (taskId) => invoke('workshop:resume', taskId),
  cancel: (taskId) => invoke('workshop:cancel', taskId),
  installSource: (taskId) => invoke('workshop:install-source', taskId),
  onChanged: (listener) => subscribeTyped('workshop:changed', listener),
}
