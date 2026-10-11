import { contentService } from '../content-package'
export const analyze = (source: import('@scnexus/app-shared/types/content.type').SourceInput) =>
  contentService.analyze('customize', source)
export const install = (
  selection: import('@scnexus/app-shared/types/content.type').InstallSelection,
  onProgress?: (progress: import('@scnexus/app-shared/types/content.type').InstallProgress) => void,
) => contentService.install(selection, 'customize', onProgress)
export const list = () => contentService.list('customize')
export const scan = () => contentService.scan()
export const prepareUninstall = (id: string) =>
  contentService.prepareRemoval(id, 'uninstall', 'customize')
export const uninstall = (
  id: string,
  decisions: import('@scnexus/app-shared/types/content.type').RemovalDecision[],
) => contentService.remove(id, decisions, 'customize')
