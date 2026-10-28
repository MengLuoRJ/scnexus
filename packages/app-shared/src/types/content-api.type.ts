import type { IpcResult } from '../errors/app.error.js'
import type {
  AnalysisResult,
  SourceInput,
  SourceAnalysisChoice,
  ContentRecord,
  ContentStore,
  CampaignActiveStoreData,
  RemovalPreview,
  RemovalDecision,
  InstallSelection,
  InstallProgress,
  ActivationPreview,
  ConflictDecision,
  ActiveCampaign,
  SciiGameSetting,
  GamePaths,
} from './content.type.js'
export interface ContentAnalysisApi {
  analyze(
    input: SourceInput,
    descriptorChoice?: SourceAnalysisChoice,
  ): Promise<IpcResult<AnalysisResult>>
}
export interface ContentApi {
  cancel(previewId: string): Promise<IpcResult<void>>
  analyze(input: SourceInput): Promise<IpcResult<AnalysisResult>>
  install(selection: InstallSelection): Promise<IpcResult<ContentRecord>>
  list(): Promise<IpcResult<ContentStore>>
  scan(): Promise<
    IpcResult<{
      records: ContentRecord[]
      active: CampaignActiveStoreData['active']
      diagnostics: { path: string; message: string }[]
      scannedAt: number
    }>
  >
  prepareUninstall(localId: string): Promise<IpcResult<RemovalPreview>>
  uninstall(removalId: string, decisions: RemovalDecision[]): Promise<IpcResult<unknown>>
}
export interface CustomizeApi extends ContentApi {
  setLauncher(localId: string, target: string | null): Promise<IpcResult<ContentRecord>>
  launch(localId: string): Promise<IpcResult<void>>
  onInstallProgress(listener: (progress: InstallProgress) => void): () => void
}
export interface CampaignApi extends ContentApi {
  onInstallProgress(listener: (progress: InstallProgress) => void): () => void
  launch(): Promise<IpcResult<void>>
  prepareActivation(localId: string): Promise<IpcResult<ActivationPreview>>
  activate(activationId: string, decisions: ConflictDecision[]): Promise<IpcResult<ActiveCampaign>>
  active(): Promise<IpcResult<CampaignActiveStoreData>>
  prepareDeactivation(localId: string): Promise<IpcResult<RemovalPreview>>
  deactivate(removalId: string, decisions: RemovalDecision[]): Promise<IpcResult<unknown>>
}
export type GameSnapshot = SciiGameSetting & {
  paths: GamePaths | null
  capabilities: { client: boolean; switcher: boolean; editor: boolean }
}
export interface GameSettingApi {
  initialize(path?: string): Promise<IpcResult<GameSnapshot>>
  get(): Promise<IpcResult<GameSnapshot>>
  configure(path: string): Promise<IpcResult<GameSnapshot>>
  refresh(): Promise<IpcResult<GameSnapshot>>
}
