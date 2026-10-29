import { ipcDesktop, ipcRequest, ipcSnapshot } from './internal/ipc-common'
import type {
  SourceInput,
  SourceAnalysisChoice,
  ContentAssets,
  ContentAsset,
} from '@scnexus/app-shared/types/content.type'

export const ipcContentAssets = (localId: string) =>
  ipcRequest<ContentAssets>(() => ipcDesktop().content.assets(localId))
export const ipcContentAsset = (localId: string, path: string) =>
  ipcRequest<ContentAsset | null>(() => ipcDesktop().content.asset(localId, path))

export const ipcContentAnalyze = (input: SourceInput, choice?: SourceAnalysisChoice) =>
  ipcRequest(() => ipcDesktop().content.analyze(ipcSnapshot(input), choice))
