import { initContentPackageIpc } from './content-package.ipc'
export { contentService, ContentService } from './content-package'
export function initContentPackageModule() {
  initContentPackageIpc()
}
