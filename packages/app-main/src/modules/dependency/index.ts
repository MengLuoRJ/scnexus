import type {
  InstallSelection,
  InstallProgress,
  RemovalDecision,
  SourceInput,
} from '@scnexus/app-shared/types/content.type'
import { contentService } from '../content-package'

export const analyze = (source: SourceInput) => contentService.analyze('dependency', source)
export const install = (
  selection: InstallSelection,
  onProgress?: (progress: InstallProgress) => void,
) => contentService.install(selection, 'dependency', onProgress)
export const list = () => contentService.list('dependency')
export const scan = () => contentService.scan()
export const prepareUninstall = (id: string) =>
  contentService.prepareRemoval(id, 'uninstall', 'dependency')
export const uninstall = (id: string, decisions: RemovalDecision[]) =>
  contentService.remove(id, decisions, 'dependency')
