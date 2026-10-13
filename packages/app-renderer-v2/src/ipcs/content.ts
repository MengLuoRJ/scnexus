import { desktop, request, ipcSnapshot } from './internal/ipc-common'
import type { SourceInput, SourceAnalysisChoice } from '@scnexus/app-shared/types/content.type'

export const apiContentAnalyze = (input: SourceInput, choice?: SourceAnalysisChoice) =>
  request(() => desktop().content.analyze(ipcSnapshot(input), choice))
