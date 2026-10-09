import { contentService } from '../content-package'
export const analyze = (source: import('@scnexus/app-shared/types/content.type').SourceInput) =>
  contentService.analyze('campaign', source)
export const install = (
  selection: import('@scnexus/app-shared/types/content.type').InstallSelection,
) => contentService.install(selection, 'campaign')
export const list = () => contentService.list('campaign')
export const scan = () => contentService.scan()
export const prepareUninstall = (id: string) =>
  contentService.prepareRemoval(id, 'uninstall', 'campaign')
export const uninstall = (
  id: string,
  decisions: import('@scnexus/app-shared/types/content.type').RemovalDecision[],
) => contentService.remove(id, decisions, 'campaign')
export const prepareActivation = (id: string) => contentService.prepareActivation(id)
export const activate = (
  id: string,
  decisions: import('@scnexus/app-shared/types/content.type').ConflictDecision[],
) => contentService.activate(id, decisions)
export const getActive = () => contentService.getActive()
export const prepareDeactivation = (id: string) => contentService.prepareRemoval(id, 'deactivate')
export const deactivate = (
  id: string,
  decisions: import('@scnexus/app-shared/types/content.type').RemovalDecision[],
) => contentService.remove(id, decisions, 'campaign')
