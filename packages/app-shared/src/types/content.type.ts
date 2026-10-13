import type { Package, PackageCampaignType } from '@scnexus/standard/package'
export type { Package, PackageCampaignType } from '@scnexus/standard/package'
export type ContentType = 'campaign' | 'customize'
export type InstallMode = 'scnexus' | 'ccm' | 'auto'
export type ResourceType = 'map' | 'mod'
export type SourceInput = { kind: 'archive' | 'directory'; path: string }
export type SourceAnalysisChoice = 'package-json' | 'metadata-txt'
export type FileInfo = {
  name: string
  path: string
  modifiedAt: number | null
  bytes: number
}
export type FileTree = FileInfo & {
  kind: 'file' | 'directory'
  children?: FileTree[]
}
export type PlannedFile = {
  source: string
  target: string
  type: ResourceType
  official: boolean
  bytes: number
  modifiedAt: number | null
}
export type Conflict = {
  conflictId: string
  type: ResourceType
  incoming: FileInfo
  local: FileInfo
}
export type ConflictDecision = {
  conflictId: string
  action: 'overwrite' | 'keep'
}
export type ModeDiagnostic = {
  mode: InstallMode
  level: 'info' | 'warning' | 'error'
  code: string
  message?: string
}
export type InstallPreview = {
  package: Package
  rootRelativePath: string
  descriptorPath: string
  origin: 'package-json' | 'ccm-converted' | 'metadata-txt' | 'auto-detected'
  files: PlannedFile[]
  targetTree: FileTree
  fileCount: number
  bytes: number
}
export type ExistingInstallation = {
  localId: string | null
  package: Package | null
  diagnostic?: { code: string; message: string }
  directory: string
  descriptorPath: string
  matchedBy: ('scnid' | 'name' | 'title' | 'directory')[]
  record: ContentRecord | null
}
export type AnalysisResult = {
  analysisId: string
  contentType: ContentType
  source: SourceInput
  sourceTree: FileTree
  sourceStats: { fileCount: number; bytes: number; compressedBytes?: number }
  modes: {
    scnexus: InstallPreview | null
    ccm: InstallPreview | null
    auto: InstallPreview | null
  }
  recommendedMode: InstallMode | null
  existingInstallations: {
    scnexus: ExistingInstallation[]
    ccm: ExistingInstallation[]
    auto: ExistingInstallation[]
  }
  conflicts: { mode: InstallMode; files: Conflict[] }[]
  diagnostics: ModeDiagnostic[]
}
export type InstalledFile = PlannedFile & {
  absolutePath: string
  result: 'copied' | 'replaced' | 'kept'
  hash: string
}
export type ContentRecord = {
  external?: boolean
  localId: string
  package: Package
  mode: 'scnexus' | 'ccm'
  origin: InstallPreview['origin']
  source: SourceInput | null
  rootRelativePath: string
  managementDirectory: string
  descriptorPath: string
  payloadDirectory: string | null
  ccmOriginal: { text: string; encoding: string } | null
  files: PlannedFile[]
  installedFiles: InstalledFile[]
  sourceTree: FileTree | null
  targetTree: FileTree
  fileCount: number
  bytes: number
  importedAt: number
  gameRoot: string
}
export type ActiveCampaign = {
  localId: string
  campaign: PackageCampaignType
  mode: 'scnexus' | 'ccm'
  descriptorPath: string
  installedFiles: InstalledFile[]
  activatedAt: number
  gameRoot: string
}
export type RemovalPreview = {
  removalId: string
  localId: string
  operation: 'uninstall' | 'deactivate'
  files: {
    conflictId: string
    file: InstalledFile
    usedBy: { localId: string; name: string; type: ContentType }[]
  }[]
}
export type RemovalDecision = { conflictId: string; action: 'delete' | 'keep' }
export type InstallSelection = {
  analysisId: string
  taskId?: string
  mode: InstallMode
  decisions: ConflictDecision[]
}
export type InstallProgress = {
  taskId: string
  analysisId: string
  stage: 'preparing' | 'extracting' | 'copying' | 'finalizing' | 'completed' | 'failed'
  percent?: number
  completedFiles: number
  totalFiles: number
  currentFile: string | null
}
export type ActivationPreview = {
  activationId: string
  localId: string
  conflicts: Conflict[]
  files: PlannedFile[]
}
export type ContentStore = {
  _schemaVersion: number
  _revision: number
  records: ContentRecord[]
  legacyRecords: Record<string, unknown>[]
  scannedAt: number | null
}
export type CampaignActiveStoreData = {
  _schemaVersion: number
  _revision: number
  active: Partial<Record<PackageCampaignType, ActiveCampaign>>
  legacyRecords: Record<string, unknown>[]
  scannedAt: number | null
}
export type SciiGameSetting = {
  _schemaVersion: number
  _revision: number
  gameRoot: string | null
  customizeDataRoot: string | null
  documentRoot: string
  confirmedAt: number | null
}
export type GamePaths = {
  _revision: number
  gameRoot: string
  mapsRoot: string
  modsRoot: string
  customizeDataRoot: string
  ccmRoot: string
  client: string
  switcher: string
  editor: string
  documentsRoot: string
  banksRoot: string
  arcadeBanksRoot: string
}
