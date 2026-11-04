import type { SourceInput } from '@scnexus/app-shared/types/content.type'
import { ipcHandle } from '../../utils/ipc-util'

export function initArchiveValidationIpc() {
  ipcHandle('content-package:validate-archive', async (input: SourceInput) => {
    const { validateArchive } = await import('./validation')
    return validateArchive(input)
  })
}
