import { ipcDesktop, ipcRequest, ipcSnapshot } from './internal/ipc-common'
import type { SourceInput, SourceAnalysisChoice } from '@scnexus/app-shared/types/content.type'

export const ipcContentAnalyze = (input: SourceInput, choice?: SourceAnalysisChoice) =>
  ipcRequest(() => ipcDesktop().content.analyze(ipcSnapshot(input), choice))
