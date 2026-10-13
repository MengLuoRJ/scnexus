import { ipcHandle } from '../../utils/ipc-util'
import { contentService } from './content-package'
import type { SourceInput, SourceAnalysisChoice } from '@scnexus/app-shared/types/content.type'
export function initContentPackageIpc() {
  ipcHandle('content-package:analyze', (input: SourceInput, choice?: SourceAnalysisChoice) =>
    contentService.analyzeContent(input, choice),
  )
  ipcHandle('content-package:cancel', (id: string) => contentService.cancel(id))
  ipcHandle('content-package:scan', () => contentService.scan())
}
