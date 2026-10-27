import { resourcePath } from '@scnexus/app-shared/utils/content-files'
import { resourceGroups, resourceState } from './resources'
import { fileTransaction, type WriteData } from './transaction'
import { notifyOperation, reportOperationWarning } from '../../utils/operation-warnings'
import { randomUUID, createHash } from 'node:crypto'
import { ccmDirectoryName } from './ccm-title'
import {
  readFile,
  writeFile,
  mkdir,
  rm,
  lstat,
  mkdtemp,
  rename,
  copyFile,
  cp,
} from 'node:fs/promises'
import { join, dirname, basename, relative } from 'node:path'
import type {
  AnalysisResult,
  ExistingInstallation,
  SourceInput,
  SourceAnalysisChoice,
  ContentType,
  InstallPreview,
  Conflict,
  ConflictDecision,
  InstalledFile,
  PlannedFile,
  ContentRecord,
  GamePaths,
  Package,
  PackageCampaignType,
  RemovalPreview,
  RemovalDecision,
  ActivationPreview,
  ActiveCampaign,
  ContentStore,
  CampaignActiveStoreData,
  InstallProgress,
} from '@scnexus/app-shared/types/content.type'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import {
  openSource,
  makeTree,
  hashFile,
  verifyArchive,
  stageArchive,
  type ContentSource,
} from './source'
import { parsePackage, parseCcm, decodeCcm, buildPreview } from './parser'
import { isContentDiagnostic } from './diagnostics'
import { detectCampaign, detectCustomize } from './auto-detector'
import { classifySource, type SourceClassification } from './classification'
import {
  campaignRoots,
  CAMPAIGNS,
  safePath,
  officialMap,
  gameAbsolutePath,
  safeGamePath,
  keyPath,
  logicalPath,
  below,
} from './paths'
import { campaignRepository } from '../../stores/campaign'
import { customizeRepository } from '../../stores/customize'
import { dependencyRepository } from '../../stores/dependency'
import { campaignActiveRepository } from '../../stores/campaign-active'
import { getGamePaths, withGameLock } from '../scii-game-setting'
const detector = (type: ContentType) => (type === 'campaign' ? detectCampaign : detectCustomize)
function officialScope(target: string, campaign: PackageCampaignType) {
  const path = target.toLowerCase()
  if (!path.startsWith('maps/campaign/')) return true
  if (campaign === 'WOL') return !/^maps\/campaign\/(swarm|void|voidprologue|nova)(\/|$)/.test(path)
  return campaignRoots[campaign].some(
    (root) => path === root.toLowerCase() || path.startsWith(root.toLowerCase() + '/'),
  )
}
export function validateRecordPaths(record: ContentRecord, paths: GamePaths) {
  if (record.gameRoot !== paths.gameRoot) throw new AppError(ERRORS.PROFILE_CHANGE_BLOCKED)
  if (record.mode !== 'scnexus' && record.mode !== 'ccm')
    throw new AppError(ERRORS.STORE_DATA_INVALID)
  const expected = join(
    record.mode === 'ccm' ? paths.ccmRoot : paths.customizeDataRoot,
    record.mode === 'ccm'
      ? record.external
        ? basename(record.managementDirectory)
        : logicalPath(relative(paths.ccmRoot, record.managementDirectory))
      : record.localId,
  )
  if (record.external) {
    if (
      record.payloadDirectory !== null ||
      !below(paths.gameRoot, record.managementDirectory) ||
      !logicalPath(record.localId) ||
      record.descriptorPath !==
        join(record.managementDirectory, record.mode === 'ccm' ? 'metadata.txt' : 'package.json')
    )
      throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
  } else if (
    logicalPath(record.localId).includes('/') ||
    record.managementDirectory !== expected ||
    record.descriptorPath !==
      join(expected, record.mode === 'ccm' ? 'metadata.txt' : 'package.json') ||
    (record.payloadDirectory !== null &&
      record.payloadDirectory !== (record.mode === 'ccm' ? expected : join(expected, 'payload')))
  )
    throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
  for (const f of [...record.files, ...record.installedFiles]) {
    if (
      !/^(Maps|Mods)\//.test(logicalPath(f.target)) ||
      f.official !== officialMap(f.target, record.package.campaign) ||
      (record.package.type === 'dependency' &&
        (f.type !== 'mod' || !logicalPath(f.target).startsWith('Mods/'))) ||
      (record.package.campaign && !officialScope(f.target, record.package.campaign))
    )
      throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
  }
}
export function validateActiveResources(
  record: ContentRecord,
  active: ActiveCampaign,
  paths: GamePaths,
) {
  if (
    active.localId !== record.localId ||
    active.gameRoot !== paths.gameRoot ||
    active.mode !== record.mode ||
    active.campaign !== record.package.campaign ||
    active.descriptorPath !==
      gameAbsolutePath(
        paths,
        campaignRoots[active.campaign][0] +
          '/' +
          (active.mode === 'ccm' ? 'metadata.txt' : 'package.json'),
      )
  )
    throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
  validateRecordPaths({ ...record, installedFiles: active.installedFiles }, paths)
  const allowed = new Map(
    resourceGroups(record.files).map((group) => [keyPath(group.target), group.files[0]!.type]),
  )
  for (const file of active.installedFiles) {
    const root = resourcePath(logicalPath(file.target))
    if (
      !(file.type === 'map' ? /^Maps\/.+\.sc2map$/i : /^Mods\/.+\.sc2mod$/i).test(root) ||
      allowed.get(keyPath(root)) !== file.type ||
      file.absolutePath !== gameAbsolutePath(paths, logicalPath(file.target))
    )
      throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
  }
  const seen = new Set<string>()
  for (const backup of active.resourceBackups ?? []) {
    const target = logicalPath(backup.target)
    const key = keyPath(target)
    if (
      record.mode !== 'scnexus' ||
      target !== resourcePath(target) ||
      !allowed.has(key) ||
      seen.has(key) ||
      !active.installedFiles.some(
        (file) => keyPath(resourcePath(file.target)) === key && file.result !== 'kept',
      ) ||
      dirname(backup.path) !== join(record.managementDirectory, '.activation-backup')
    )
      throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
    seen.add(key)
  }
}
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex')
async function existing(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
interface Index<T> {
  getSnapshot(): T
  update(value: T): T
}
type Context = {
  source: ContentSource
  result: AnalysisResult
  root: string
  gameRevision: number
  hashes: Map<string, string>
  expires: number
  descriptorChoice?: SourceAnalysisChoice
}
type Activation = {
  record: ContentRecord
  preview: ActivationPreview
  gameRevision: number
  hashes: Map<string, string>
  expires: number
}
type Removal = {
  preview: RemovalPreview
  record: ContentRecord
  active: boolean
  gameRevision: number
  stamp: string
  hashes: Map<string, string | null>
  expires: number
}
export class ContentService {
  private cancelled = new Set<string>()
  private extractionControllers = new Map<string, AbortController>()
  cancel(previewId: string) {
    if (
      !this.analyses.has(previewId) &&
      !this.activations.has(previewId) &&
      !this.removals.has(previewId)
    )
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
    this.cancelled.add(previewId)
    this.extractionControllers.get(previewId)?.abort()
    this.analyses.delete(previewId)
    this.activations.delete(previewId)
    this.removals.delete(previewId)
    if (this.cancelled.size > 100) this.cancelled.delete(this.cancelled.values().next().value!)
  }
  private checkCancelled(id?: string) {
    if (id && this.cancelled.has(id)) throw new AppError(ERRORS.TASK_CANCELLED, { taskId: id })
  }
  private operationId: string | undefined
  private async operation<T>(id: string, run: () => Promise<T>): Promise<T> {
    return this.lock(async () => {
      this.checkCancelled(id)
      this.operationId = id
      try {
        return await run()
      } finally {
        this.operationId = undefined
      }
    })
  }
  private analyses = new Map<string, Context>()
  private activations = new Map<string, Activation>()
  private removals = new Map<string, Removal>()
  constructor(
    private paths: () => Promise<GamePaths>,
    private campaign: Index<ContentStore>,
    private customize: Index<ContentStore>,
    private active: Index<CampaignActiveStoreData>,
    private lock: <T>(run: () => Promise<T>) => Promise<T> = withGameLock,
    private dependency: Index<ContentStore> = (() => {
      let data: ContentStore = {
        _schemaVersion: 2,
        _revision: 0,
        records: [],
        legacyRecords: [],
        scannedAt: null,
      }
      return {
        getSnapshot: () => structuredClone(data),
        update: (next: ContentStore) => {
          data = structuredClone({ ...next, _revision: data._revision + 1 })
          return structuredClone(data)
        },
      }
    })(),
  ) {}
  private index(type: ContentType) {
    return type === 'campaign'
      ? this.campaign
      : type === 'dependency'
        ? this.dependency
        : this.customize
  }
  private prune() {
    for (const map of [this.analyses, this.activations, this.removals])
      for (const [key, value] of map) if (value.expires < Date.now()) map.delete(key)
    if (this.analyses.size + this.activations.size + this.removals.size > 30)
      throw new AppError(ERRORS.TASK_CONFLICT, {
        message: 'Too many outstanding previews',
      })
  }
  private async findExisting(
    type: ContentType,
    preview: InstallPreview,
    mode: 'scnexus' | 'ccm',
    paths: GamePaths,
  ): Promise<ExistingInstallation[]> {
    const matches: ExistingInstallation[] = []
    for (const record of this.index(type).getSnapshot().records) {
      if (record.gameRoot !== paths.gameRoot || record.mode !== mode) continue
      const matchedBy: ExistingInstallation['matchedBy'] = []
      if (mode === 'scnexus') {
        if (preview.package.scnid !== undefined && record.package.scnid === preview.package.scnid)
          matchedBy.push('scnid')
        if (record.package.name === preview.package.name) matchedBy.push('name')
      } else if (record.package.name === preview.package.name) matchedBy.push('title')
      if (matchedBy.length && (await existing(record.managementDirectory)))
        matches.push({
          localId: record.localId,
          package: record.package,
          directory: record.managementDirectory,
          descriptorPath: record.descriptorPath,
          matchedBy,
          record,
        })
    }
    if (mode === 'ccm') {
      const directory = await safeGamePath(
        paths,
        relative(paths.gameRoot, join(paths.ccmRoot, ccmDirectoryName(preview.package.name))),
      )
      const info = await existing(directory)
      if (info) {
        const descriptorPath = join(directory, 'metadata.txt')
        let pkg: Package | null = null
        let diagnostic: ExistingInstallation['diagnostic']
        try {
          pkg = parseCcm(decodeCcm(await readFile(descriptorPath)).text)
        } catch (error) {
          if (!isContentDiagnostic(error)) throw error
          diagnostic = {
            code: ERRORS.ARCHIVE_METADATA_INVALID.code,
            message: '已存在同名内容，但信息无法解析',
          }
        }
        const found = matches.find((record) => keyPath(record.directory) === keyPath(directory))
        if (found) {
          found.matchedBy.push('directory')
          found.package = pkg
          if (diagnostic) found.diagnostic = diagnostic
        } else {
          matches.push({
            localId: null,
            package: pkg,
            ...(diagnostic ? { diagnostic } : {}),
            directory,
            descriptorPath,
            matchedBy: pkg?.name === preview.package.name ? ['title', 'directory'] : ['directory'],
            record: null,
          })
        }
      }
    }
    return matches
  }
  private async conflicts(
    files: PlannedFile[],
    paths: GamePaths,
    states = new Map<string, Awaited<ReturnType<typeof resourceState>>>(),
  ) {
    const result: Conflict[] = []
    for (const group of resourceGroups(files)) {
      const file = group.files[0]!
      const target = await safeGamePath(paths, group.target)
      if (!states.has(target)) states.set(target, await resourceState(target))
      const info = states.get(target)
      if (info) {
        result.push({
          conflictId: randomUUID(),
          type: file.type,
          incoming: {
            name: basename(group.target),
            path: file.source.slice(
              0,
              file.source.length - (file.target.length - group.target.length),
            ),
            bytes: group.files.reduce((sum, item) => sum + item.bytes, 0),
            modifiedAt: file.modifiedAt,
          },
          local: {
            name: basename(target),
            path: target,
            bytes: info.bytes,
            modifiedAt: info.modifiedAt,
          },
        })
      }
    }
    return result
  }
  async analyzeContent(input: SourceInput, choice?: SourceAnalysisChoice): Promise<AnalysisResult> {
    this.prune()
    const paths = await this.paths()
    const source = await openSource(input)
    const read = source.read
    const descriptors = new Map<string, Buffer>()
    source.read = async (path) => {
      if (!descriptors.has(path)) descriptors.set(path, await read(path))
      return descriptors.get(path)!
    }
    const classification = await classifySource(source, choice)
    const descriptorHashes = new Map([...descriptors].map(([path, data]) => [path, hash(data)]))
    return this.analyzeSource(
      classification.type,
      input,
      paths,
      source,
      classification,
      choice,
      descriptorHashes,
    )
  }
  async analyze(type: ContentType, input: SourceInput): Promise<AnalysisResult> {
    if (!['campaign', 'customize', 'dependency'].includes(type))
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
    this.prune()
    const paths = await this.paths()
    return this.analyzeSource(type, input, paths, await openSource(input))
  }
  private async analyzeSource(
    type: ContentType,
    input: SourceInput,
    paths: GamePaths,
    source: ContentSource,
    classification?: SourceClassification,
    descriptorChoice?: SourceAnalysisChoice,
    descriptorHashes = new Map<string, string>(),
  ): Promise<AnalysisResult> {
    const result: AnalysisResult = {
      analysisId: randomUUID(),
      contentType: type,
      source: input,
      sourceTree: source.tree,
      sourceStats: {
        ...(input.kind === 'archive' ? { compressedBytes: (await lstat(input.path)).size } : {}),
        fileCount: source.entries.length,
        bytes: source.entries.reduce((n, e) => n + e.bytes, 0),
      },
      modes: { scnexus: null, ccm: null, auto: null },
      recommendedMode: null,
      existingInstallations: { scnexus: [], ccm: [], auto: [] },
      conflicts: [],
      diagnostics: [],
    }
    const discover = async (name: string, ccm: boolean) => {
      const found: InstallPreview[] = []
      for (const entry of source.entries
        .filter((e) =>
          classification
            ? e.path === classification.descriptors[ccm ? 'metadata-txt' : 'package-json']
            : e.path.split('/').at(-1)?.toLowerCase() === name,
        )
        .filter(
          (e) =>
            !e.path
              .split('/')
              .slice(0, -1)
              .some((p) => /\.sc2(map|mod)$/i.test(p)),
        )) {
        try {
          if (entry.bytes > 1024 * 1024) throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
          const data = await source.read(entry.path)
          const pkg = ccm
            ? parseCcm(decodeCcm(data).text)
            : parsePackage(data.toString('utf8'), type)
          found.push(buildPreview(source, entry.path, pkg, ccm))
        } catch (error) {
          if (!isContentDiagnostic(error)) throw error
          result.diagnostics.push({
            mode: ccm ? 'ccm' : 'scnexus',
            level: 'error',
            code: error.code,
            message: `Invalid descriptor: ${entry.path}`,
          })
        }
      }
      if (!found.length) return null
      const depth = Math.min(...found.map((p) => p.descriptorPath.split('/').length))
      const outer = found.filter((p) => p.descriptorPath.split('/').length === depth)
      if (outer.length > 1) {
        result.diagnostics.push({
          mode: ccm ? 'ccm' : 'scnexus',
          level: 'error',
          code: ERRORS.ARCHIVE_METADATA_INVALID.code,
          message: 'Multiple outermost packages: ' + outer.map((p) => p.descriptorPath).join(', '),
        })
        return null
      }
      return outer[0]
    }
    result.modes.scnexus = await discover('package.json', false)
    if (type === 'campaign') result.modes.ccm = await discover('metadata.txt', true)
    if (!result.modes.scnexus && result.modes.ccm) {
      result.modes.scnexus = {
        ...structuredClone(result.modes.ccm),
        origin: 'ccm-converted',
      }
    }
    const automatic =
      type === 'dependency' ? { preview: null, diagnostic: undefined } : detector(type)(source)
    result.modes.auto = automatic.preview
    if (automatic.diagnostic) result.diagnostics.push(automatic.diagnostic)
    for (const name of ['scnexus', 'ccm'] as const) {
      const preview = result.modes[name]
      if (preview?.package.dependencies?.length)
        result.diagnostics.push({
          mode: name,
          level: 'warning',
          code: 'DEPENDENCIES_REQUIRE_MANUAL_CHECK',
          message:
            'Declared dependencies are not downloaded automatically; confirm they are installed',
        })
    }
    const recommended =
      result.modes.scnexus?.origin === 'package-json'
        ? result.modes.scnexus.package.manager
        : undefined
    const mode = recommended === 'SCNexus' ? 'scnexus' : recommended === 'CCM' ? 'ccm' : null
    if (mode && result.modes[mode]) result.recommendedMode = mode
    if (type === 'dependency' && result.modes.scnexus) result.recommendedMode = 'scnexus'
    const hashes = new Map<string, string>(input.kind === 'directory' ? descriptorHashes : [])
    const targetStates = new Map<string, Awaited<ReturnType<typeof resourceState>>>()
    for (const mode of ['scnexus', 'ccm', 'auto'] as const) {
      const preview = result.modes[mode]
      if (!preview) continue
      result.existingInstallations[mode] = await this.findExisting(
        type,
        preview,
        mode === 'auto' ? 'scnexus' : mode,
        paths,
      )
      const conflictFiles =
        type === 'campaign' && mode !== 'ccm'
          ? []
          : mode === 'ccm'
            ? preview.files.filter((file) => file.type === 'mod')
            : preview.files
      result.conflicts.push({
        mode,
        files: await this.conflicts(conflictFiles, paths, targetStates),
      })
      if (input.kind === 'directory' && mode !== 'auto') {
        if (type === 'campaign')
          for (const file of preview.files)
            if (!hashes.has(file.source))
              hashes.set(file.source, await hashFile(await safePath(input.path, file.source)))
        if (!hashes.has(preview.descriptorPath))
          hashes.set(
            preview.descriptorPath,
            await hashFile(await safePath(input.path, preview.descriptorPath)),
          )
      }
    }
    for (const group of result.conflicts)
      for (const file of group.files)
        hashes.set('local:' + file.local.path, targetStates.get(file.local.path)!.hash)
    if (input.kind === 'archive') await verifyArchive(source)
    else
      for (const [path, digest] of descriptorHashes)
        if ((await hashFile(await safePath(input.path, path))) !== digest)
          throw new AppError(ERRORS.TASK_CONFLICT, {
            message: 'Descriptor changed during analysis',
          })
    this.analyses.set(result.analysisId, {
      source,
      result,
      descriptorChoice,
      root: paths.gameRoot,
      gameRevision: paths._revision,
      hashes,
      expires: Date.now() + 30 * 60 * 1000,
    })
    return structuredClone(result)
  }
  private decisions(conflicts: Conflict[], decisions: ConflictDecision[], _files: PlannedFile[]) {
    if (!Array.isArray(decisions)) throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
    const choices = new Map<string, 'overwrite' | 'keep'>()
    const seen = new Set<string>()
    for (const decision of decisions) {
      const c = conflicts.find((c) => c.conflictId === decision?.conflictId)
      if (!c || seen.has(c.conflictId) || !['keep', 'overwrite'].includes(decision.action))
        throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
      seen.add(c.conflictId)
      choices.set(keyPath(c.local.path), decision.action)
    }
    for (const c of conflicts)
      if (!seen.has(c.conflictId))
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: 'Unresolved file conflicts',
        })
    return choices
  }
  private async recheckConflicts(
    files: PlannedFile[],
    conflicts: Conflict[],
    paths: GamePaths,
    hashes: Map<string, string>,
  ) {
    for (const group of resourceGroups(files)) {
      const target = await safeGamePath(paths, group.target)
      const actual = await resourceState(target)
      const old = conflicts.find((c) => keyPath(c.local.path) === keyPath(target))
      if (
        !!actual !== !!old ||
        (actual && old && actual.hash !== hashes.get('local:' + old.local.path))
      )
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: 'Target resource changed; request a new preview',
        })
    }
  }
  private async transaction<T>(
    paths: GamePaths,
    run: (write: (path: string, data: WriteData) => Promise<void>) => Promise<T>,
    removeDirectories: string[] = [],
    operationId?: string,
  ): Promise<T> {
    return fileTransaction(
      paths.gameRoot,
      async (write) => {
        this.checkCancelled(operationId ?? this.operationId)
        return run(async (path, data) => {
          this.checkCancelled(operationId ?? this.operationId)
          await write(path, data)
        })
      },
      removeDirectories,
    )
  }

  private async copy(
    files: PlannedFile[],
    read: (source: string) => Promise<string>,
    paths: GamePaths,
    choices: Map<string, string>,
    write: (path: string, data: WriteData) => Promise<void>,
    sourceDirectories: string[] = [],
  ) {
    const installed: InstalledFile[] = []
    for (const group of resourceGroups(files)) {
      const root = await safeGamePath(paths, group.target)
      const local = await existing(root)
      if (choices.get(keyPath(root)) === 'keep') {
        const entries = local?.isDirectory()
          ? (await openSource({ kind: 'directory', path: root })).entries.map((entry) => ({
              ...entry,
              path: group.target + '/' + entry.path,
            }))
          : [{ path: group.target, bytes: local!.size, modifiedAt: local!.mtimeMs }]
        for (const entry of entries) {
          const absolutePath = await safeGamePath(paths, entry.path)
          installed.push({
            ...group.files[0]!,
            source: entry.path,
            target: entry.path,
            absolutePath,
            bytes: entry.bytes,
            result: 'kept',
            hash: await hashFile(absolutePath),
          })
        }
        continue
      }
      const stage = await mkdtemp(join(paths.gameRoot, '.scnexus-resource-'))
      try {
        const directory = group.files.some((file) => keyPath(file.target) !== keyPath(group.target))
        const payload = join(stage, 'payload')
        if (directory) {
          await mkdir(payload)
          const file = group.files[0]!
          const sourceRoot = file.source.slice(
            0,
            file.source.length - (file.target.length - group.target.length),
          )
          for (const entry of sourceDirectories)
            if (entry.startsWith(sourceRoot + '/'))
              await mkdir(await safePath(payload, entry.slice(sourceRoot.length + 1)), {
                recursive: true,
              })
        }
        for (const f of group.files) {
          const source = await read(f.source)
          const digest = await hashFile(source)
          const destination = directory
            ? await safePath(payload, f.target.slice(group.target.length + 1))
            : payload
          await mkdir(dirname(destination), { recursive: true })
          await copyFile(source, destination)
          if ((await hashFile(destination)) !== digest)
            throw new AppError(ERRORS.TASK_CONFLICT, { message: 'Payload changed while copying' })
          installed.push({
            ...f,
            absolutePath: gameAbsolutePath(paths, f.target),
            result: local ? 'replaced' : 'copied',
            hash: digest,
          })
        }
        await write(root, directory ? { directory: payload } : { file: payload })
      } finally {
        await rm(stage, { recursive: true, force: true })
      }
    }
    return installed
  }
  async install(
    selection: {
      analysisId: string
      taskId?: string
      mode: string
      decisions: ConflictDecision[]
    },
    expectedType?: ContentType,
    onProgress?: (progress: InstallProgress) => void,
  ): Promise<ContentRecord> {
    if (
      !selection ||
      typeof selection.analysisId !== 'string' ||
      typeof selection.mode !== 'string' ||
      (selection.taskId !== undefined &&
        (typeof selection.taskId !== 'string' ||
          !selection.taskId.trim() ||
          selection.taskId.length > 200))
    )
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
    const progress: InstallProgress = {
      taskId: selection.taskId ?? selection.analysisId,
      analysisId: selection.analysisId,
      stage: 'preparing',
      completedFiles: 0,
      totalFiles: 0,
      currentFile: null,
    }
    const report = (stage: InstallProgress['stage'], currentFile: string | null = null) => {
      progress.stage = stage
      if (stage !== 'extracting') delete progress.percent
      progress.currentFile = currentFile
      if (onProgress) notifyOperation(() => onProgress({ ...progress }), progress.taskId)
    }
    return this.operation(selection.analysisId, async () => {
      report('preparing')
      this.prune()
      const context = this.analyses.get(selection?.analysisId)
      const selectedMode = selection?.mode
      if (!context || !['scnexus', 'ccm', 'auto'].includes(selectedMode))
        throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
      const mode = selectedMode === 'auto' ? 'scnexus' : selectedMode
      const preview = context.result.modes[selectedMode as 'scnexus' | 'ccm' | 'auto']
      if (!preview) throw new AppError(ERRORS.CONTENT_TYPE_UNSUPPORTED)
      const paths = await this.paths()
      if (context.root !== paths.gameRoot || context.gameRevision !== paths._revision)
        throw new AppError(ERRORS.TASK_CONFLICT)
      const source =
        context.source.input.kind === 'archive'
          ? context.source
          : await openSource(context.source.input)
      if (
        JSON.stringify(source.entries) !== JSON.stringify(context.source.entries) ||
        JSON.stringify(source.directories) !== JSON.stringify(context.source.directories)
      )
        throw new AppError(ERRORS.TASK_CONFLICT, { message: 'Source layout changed' })
      for (const [path, digest] of context.hashes)
        if (
          !path.startsWith('local:') &&
          (await hashFile(await safePath(source.input.path, path))) !== digest
        )
          throw new AppError(ERRORS.TASK_CONFLICT, { message: 'Source changed' })
      if (selectedMode === 'auto') {
        const current = detector(context.result.contentType)(source).preview
        if (!current || JSON.stringify(current) !== JSON.stringify(preview))
          throw new AppError(ERRORS.TASK_CONFLICT, {
            message: 'Automatic recognition changed; request a new analysis',
          })
        if (source.input.kind === 'directory')
          for (const file of preview.files)
            context.hashes.set(
              file.source,
              await hashFile(await safePath(source.input.path, file.source)),
            )
      }
      const type = context.result.contentType
      if (type !== 'campaign' && selectedMode !== 'auto' && source.input.kind === 'directory')
        for (const file of preview.files)
          context.hashes.set(
            file.source,
            await hashFile(await safePath(source.input.path, file.source)),
          )
      if (expectedType && type !== expectedType) throw new AppError(ERRORS.CONTENT_TYPE_UNSUPPORTED)
      if ((await this.findExisting(type, preview, mode as 'scnexus' | 'ccm', paths)).length)
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: 'Matching content is already installed; request a new analysis',
        })
      const direct = type !== 'campaign' || mode === 'ccm'
      const actualFiles =
        mode === 'ccm' ? preview.files.filter((f) => f.type === 'mod') : preview.files
      const conflicts = context.result.conflicts
        .find((c) => c.mode === selectedMode)!
        .files.filter((c) => mode !== 'ccm' || c.type === 'mod')
      const choices = direct
        ? this.decisions(conflicts, selection.decisions ?? [], actualFiles)
        : new Map<string, string>()
      if (direct) await this.recheckConflicts(actualFiles, conflicts, paths, context.hashes)
      const localId = randomUUID()
      const management =
        mode === 'ccm'
          ? join(paths.ccmRoot, ccmDirectoryName(preview.package.name))
          : join(paths.customizeDataRoot, localId)
      const payload =
        type === 'campaign' ? (mode === 'ccm' ? management : join(management, 'payload')) : null
      await safeGamePath(paths, relative(paths.gameRoot, management))
      if (await existing(management))
        throw new AppError(ERRORS.TASK_CONFLICT, { message: 'Package directory already exists' })
      const staging = await mkdtemp(join(paths.gameRoot, '.scnexus-stage-'))
      try {
        const originalCcmPath =
          type !== 'campaign' ||
          preview.origin === 'auto-detected' ||
          context.descriptorChoice === 'package-json'
            ? undefined
            : preview.origin !== 'package-json'
              ? preview.descriptorPath
              : source.entries.find(
                  (e) =>
                    e.path ===
                    (preview.rootRelativePath ? preview.rootRelativePath + '/' : '') +
                      'metadata.txt',
                )?.path
        const selected = [
          ...(payload
            ? preview.files
            : actualFiles.filter(
                (file) =>
                  choices.get(keyPath(gameAbsolutePath(paths, resourcePath(file.target)))) !==
                  'keep',
              )
          ).map((file) => file.source),
          ...(preview.descriptorPath ? [preview.descriptorPath] : []),
          ...(originalCcmPath ? [originalCcmPath] : []),
        ]
        let stagedFiles: Map<string, string>
        if (source.input.kind === 'archive') {
          const controller = new AbortController()
          this.extractionControllers.set(selection.analysisId, controller)
          try {
            report('extracting')
            this.checkCancelled(selection.analysisId)
            stagedFiles = await stageArchive(
              source,
              selected,
              join(staging, 'extracted'),
              controller.signal,
              (percent) => {
                progress.percent = percent
                report('extracting')
              },
            )
          } catch (error) {
            this.checkCancelled(selection.analysisId)
            throw error
          } finally {
            this.extractionControllers.delete(selection.analysisId)
          }
        } else {
          stagedFiles = new Map(
            await Promise.all(
              [...new Set(selected)].map(
                async (path) => [path, await safePath(source.input.path, path)] as const,
              ),
            ),
          )
        }
        this.checkCancelled(selection.analysisId)
        const readMetadata = async (path: string) => {
          const file = stagedFiles.get(path)!
          if ((await lstat(file)).size > 1024 * 1024)
            throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
          return readFile(file)
        }
        const ccm = originalCcmPath ? decodeCcm(await readMetadata(originalCcmPath)) : null
        const pkg = structuredClone(preview.package)
        if (preview.origin === 'ccm-converted') {
          pkg.maps = preview.files
            .filter((f) => f.type === 'map' && !f.official)
            .map((f) => ({
              name: basename(f.target),
              source_path: '/' + f.target,
              target_path: '/' + f.target,
            }))
          pkg.mods = [
            ...new Set(
              preview.files
                .filter((f) => f.type === 'mod')
                .map((f) => f.target.match(/^(.*?\.sc2mod)(?:\/|$)/i)![1]),
            ),
          ].map((target) => ({
            name: basename(target),
            source_path: '/' + target,
            target_path: '/' + target,
            components: preview.files.some((f) => f.target.startsWith(target + '/')),
          }))
        }
        const files = preview.files.map((f) => ({
          ...f,
          source:
            type === 'campaign'
              ? mode === 'scnexus' && ['ccm-converted', 'auto-detected'].includes(preview.origin)
                ? f.target
                : f.source.slice(preview.rootRelativePath ? preview.rootRelativePath.length + 1 : 0)
              : f.source,
        }))
        const record: ContentRecord = {
          localId,
          package: pkg,
          mode: mode as 'scnexus' | 'ccm',
          origin: preview.origin,
          source: source.input,
          rootRelativePath: preview.rootRelativePath,
          managementDirectory: management,
          descriptorPath: join(management, mode === 'ccm' ? 'metadata.txt' : 'package.json'),
          payloadDirectory: payload,
          ccmOriginal: ccm,
          files,
          installedFiles: [],
          sourceTree: source.tree,
          targetTree: preview.targetTree,
          fileCount: preview.fileCount,
          bytes: preview.bytes,
          importedAt: Date.now(),
          gameRoot: paths.gameRoot,
        }
        progress.totalFiles =
          (payload ? preview.files.length : 0) +
          (direct
            ? actualFiles.filter(
                (file) =>
                  choices.get(keyPath(gameAbsolutePath(paths, resourcePath(file.target)))) !==
                  'keep',
              ).length
            : 0) +
          1 +
          (mode === 'scnexus' ? 1 + (ccm ? 1 : 0) : 0)
        const stagedManagement = join(staging, 'management')
        await mkdir(stagedManagement)
        const payloadPaths: string[] = []
        if (payload) {
          const stagedPayload =
            mode === 'ccm' ? stagedManagement : join(stagedManagement, 'payload')
          await mkdir(stagedPayload, { recursive: true })
          for (const f of preview.files) {
            this.checkCancelled(selection.analysisId)
            const logical =
              mode === 'scnexus' && ['ccm-converted', 'auto-detected'].includes(preview.origin)
                ? f.target
                : f.source.slice(preview.rootRelativePath ? preview.rootRelativePath.length + 1 : 0)
            const destination = await safePath(stagedPayload, logical)
            await mkdir(dirname(destination), { recursive: true })
            const sourceFile = stagedFiles.get(f.source)!
            if (source.input.kind === 'archive') await rename(sourceFile, destination)
            else await copyFile(sourceFile, destination)
            if (
              source.input.kind === 'directory' &&
              (await hashFile(destination)) !== context.hashes.get(f.source)
            )
              throw new AppError(ERRORS.TASK_CONFLICT, { message: 'Source changed while staging' })
            stagedFiles.set(f.source, destination)
            payloadPaths.push(join(payload, logical))
          }
          for (const group of resourceGroups(preview.files)) {
            const file = group.files[0]!
            const tailLength = file.target.length - group.target.length
            if (!tailLength) continue
            const sourceRoot = file.source.slice(0, -tailLength)
            const stored = files.find((item) => item.target === file.target)!
            const storedRoot = stored.source.slice(0, -tailLength)
            for (const directory of source.directories ?? [])
              if (directory.startsWith(sourceRoot + '/'))
                await mkdir(
                  await safePath(stagedPayload, storedRoot + directory.slice(sourceRoot.length)),
                  { recursive: true },
                )
          }
        }
        const metadataFiles: { path: string; data: Buffer }[] = [
          {
            path: record.descriptorPath,
            data:
              mode === 'ccm'
                ? await readMetadata(preview.descriptorPath)
                : Buffer.from(JSON.stringify(pkg, null, 2)),
          },
        ]
        if (mode === 'scnexus' && ccm)
          metadataFiles.push({
            path: join(management, 'metadata.txt'),
            data: await readMetadata(originalCcmPath!),
          })
        for (const file of metadataFiles)
          await writeFile(join(stagedManagement, relative(management, file.path)), file.data)
        if (direct) await this.recheckConflicts(actualFiles, conflicts, paths, context.hashes)
        this.checkCancelled(selection.analysisId)
        report('copying')
        return await this.transaction(paths, async (write) => {
          const completed = (path: string) => {
            progress.completedFiles++
            report(progress.stage, relative(paths.gameRoot, path).replaceAll('\\', '/'))
            this.checkCancelled(selection.analysisId)
          }
          if (direct) {
            record.installedFiles = await this.copy(
              actualFiles,
              async (path) => {
                const file = stagedFiles.get(path)!
                if (
                  source.input.kind === 'directory' &&
                  (await hashFile(file)) !== context.hashes.get(path)
                )
                  throw new AppError(ERRORS.TASK_CONFLICT, { message: 'Source changed' })
                return file
              },
              paths,
              choices,
              write,
              source.directories,
            )
            for (const file of record.installedFiles)
              if (file.result !== 'kept') completed(file.absolutePath)
          }
          if (type !== 'campaign') {
            record.targetTree = makeTree(
              record.installedFiles.map((f) => ({
                path: f.target,
                bytes: f.bytes,
                modifiedAt: f.modifiedAt,
              })),
              'GameRoot',
            )
            record.fileCount = record.installedFiles.length
            record.bytes = record.installedFiles.reduce((n, f) => n + f.bytes, 0)
          }
          if (mode === 'scnexus') {
            const manifest = join(management, 'install-manifest.json')
            await writeFile(
              join(stagedManagement, 'install-manifest.json'),
              JSON.stringify(record, null, 2),
            )
            metadataFiles.push({ path: manifest, data: Buffer.alloc(0) })
          }
          if (source.input.kind === 'archive') await verifyArchive(source)
          else {
            const current = await openSource(source.input)
            if (
              JSON.stringify(current.entries) !== JSON.stringify(source.entries) ||
              JSON.stringify(current.directories) !== JSON.stringify(source.directories) ||
              (selectedMode === 'auto' && !detector(type)(current).preview)
            )
              throw new AppError(ERRORS.TASK_CONFLICT, { message: 'Source layout changed' })
            for (const [path, digest] of context.hashes)
              if (
                !path.startsWith('local:') &&
                (await hashFile(await safePath(source.input.path, path))) !== digest
              )
                throw new AppError(ERRORS.TASK_CONFLICT, { message: 'Source changed' })
          }
          if (await existing(management))
            throw new AppError(ERRORS.TASK_CONFLICT, {
              message: 'Package directory already exists',
            })
          await write(management, { directory: stagedManagement })
          for (const path of payloadPaths) completed(path)
          report('finalizing')
          for (const file of metadataFiles) completed(file.path)
          const currentPaths = await this.paths()
          if (
            currentPaths.gameRoot !== paths.gameRoot ||
            currentPaths._revision !== paths._revision
          )
            throw new AppError(ERRORS.TASK_CONFLICT)
          const index = this.index(type)
          const old = index.getSnapshot()
          index.update({ ...old, records: [...old.records, record] })
          this.analyses.delete(selection.analysisId)
          return record
        })
      } finally {
        try {
          await rm(staging, { recursive: true, force: true })
        } catch (cause) {
          reportOperationWarning(
            new AppError(
              ERRORS.CONTENT_CLEANUP_WARNING,
              {
                message: 'Content staging cleanup failed; files retained',
                taskId: progress.taskId,
              },
              { cause },
            ),
          )
        }
      }
    })
      .then((record) => {
        report('completed')
        return record
      })
      .catch((error) => {
        report('failed')
        throw error
      })
  }
  private find(localId: string): ContentRecord {
    for (const index of [this.campaign, this.customize, this.dependency]) {
      const record = index.getSnapshot().records.find((r) => r.localId === localId)
      if (record) return structuredClone(record)
    }
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT, {
      message: 'Unknown local content ID',
    })
  }
  async prepareActivation(localId: string): Promise<ActivationPreview> {
    this.prune()
    const record = this.find(localId)
    if (record.package.type !== 'campaign' || !record.payloadDirectory)
      throw new AppError(ERRORS.CONTENT_TYPE_UNSUPPORTED)
    const paths = await this.paths()
    validateRecordPaths(record, paths)
    await safeGamePath(paths, relative(paths.gameRoot, record.managementDirectory))
    const files =
      record.mode === 'ccm' ? record.files.filter((f) => f.type === 'map') : record.files
    const targetStates = new Map<string, Awaited<ReturnType<typeof resourceState>>>()
    const preview: ActivationPreview = {
      activationId: randomUUID(),
      localId,
      files,
      conflicts: await this.conflicts(files, paths, targetStates),
    }
    const hashes = new Map<string, string>()
    for (const f of files)
      hashes.set(f.source, await hashFile(await safePath(record.payloadDirectory, f.source)))
    for (const file of preview.conflicts)
      hashes.set('local:' + file.local.path, targetStates.get(file.local.path)!.hash)
    for (const group of resourceGroups(files)) {
      const file = group.files[0]!
      const sourceRoot = file.source.slice(
        0,
        file.source.length - (file.target.length - group.target.length),
      )
      hashes.set(
        'resource:' + sourceRoot,
        (await resourceState(await safePath(record.payloadDirectory, sourceRoot)))!.hash,
      )
    }
    hashes.set('descriptor', await hashFile(record.descriptorPath))
    this.activations.set(preview.activationId, {
      record,
      preview,
      gameRevision: paths._revision,
      hashes,
      expires: Date.now() + 30 * 60 * 1000,
    })
    return structuredClone(preview)
  }
  async activate(activationId: string, decisions: ConflictDecision[] = []) {
    return this.operation(activationId, async () => {
      this.prune()
      const context = this.activations.get(activationId)
      if (!context) throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
      const { record, preview } = context
      const paths = await this.paths()
      if (context.gameRevision !== paths._revision)
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: 'Game configuration changed',
        })
      validateRecordPaths(record, paths)
      await safeGamePath(paths, relative(paths.gameRoot, record.managementDirectory))
      const state = this.active.getSnapshot()
      const previous = state.active[record.package.campaign!]
      if (previous)
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: 'Deactivate current campaign first',
        })
      const choices = this.decisions(preview.conflicts, decisions, preview.files)
      await this.recheckConflicts(preview.files, preview.conflicts, paths, context.hashes)
      if (hash(await readFile(record.descriptorPath)) !== context.hashes.get('descriptor'))
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: 'Descriptor changed',
        })
      for (const [key, digest] of context.hashes) {
        if (!key.startsWith('resource:')) continue
        const sourceRoot = await safePath(record.payloadDirectory!, key.slice('resource:'.length))
        if ((await resourceState(sourceRoot))?.hash !== digest)
          throw new AppError(ERRORS.TASK_CONFLICT, { message: 'Payload resource changed' })
      }
      const read = async (path: string) => {
        const file = await safePath(record.payloadDirectory!, path)
        if ((await hashFile(file)) !== context.hashes.get(path))
          throw new AppError(ERRORS.TASK_CONFLICT, {
            message: 'Payload changed',
          })
        return file
      }
      return this.transaction(paths, async (write) => {
        const resourceBackups: { target: string; path: string }[] = []
        for (const group of record.mode === 'scnexus' ? resourceGroups(preview.files) : []) {
          const target = await safeGamePath(paths, group.target)
          if (choices.get(keyPath(target)) === 'keep' || !(await existing(target))) continue
          const backup = await safeGamePath(
            paths,
            relative(
              paths.gameRoot,
              join(record.managementDirectory, '.activation-backup', randomUUID()),
            ),
          )
          await mkdir(dirname(backup), { recursive: true })
          const state = await resourceState(target)
          if (state?.directory) {
            const stage = await mkdtemp(join(paths.gameRoot, '.scnexus-backup-'))
            try {
              await cp(target, join(stage, 'resource'), { recursive: true })
              await write(backup, { directory: join(stage, 'resource') })
            } finally {
              await rm(stage, { recursive: true, force: true })
            }
          } else await write(backup, { file: target })
          resourceBackups.push({ target: group.target, path: backup })
        }
        const payloadSource = await openSource({
          kind: 'directory',
          path: record.payloadDirectory!,
        })
        const installedFiles = await this.copy(
          preview.files,
          read,
          paths,
          choices,
          write,
          payloadSource.directories,
        )
        const root = campaignRoots[record.package.campaign!][0]
        const descriptor = await safeGamePath(
          paths,
          root + '/' + (record.mode === 'ccm' ? 'metadata.txt' : 'package.json'),
        )
        await write(descriptor, await readFile(record.descriptorPath))
        await write(
          await safeGamePath(
            paths,
            root + '/' + (record.mode === 'ccm' ? 'package.json' : 'metadata.txt'),
          ),
          null,
        )
        const active = {
          localId: record.localId,
          campaign: record.package.campaign!,
          mode: record.mode,
          descriptorPath: descriptor,
          installedFiles:
            record.mode === 'ccm'
              ? [...installedFiles, ...record.installedFiles.filter((f) => f.type === 'mod')]
              : installedFiles,
          resourceBackups,
          activatedAt: Date.now(),
          gameRoot: paths.gameRoot,
        }
        if (record.mode === 'scnexus')
          await write(
            join(record.managementDirectory, 'active-manifest.json'),
            Buffer.from(JSON.stringify(active, null, 2)),
          )
        this.active.update({
          ...state,
          active: { ...state.active, [active.campaign]: active },
        })
        this.activations.delete(activationId)
        return active
      })
    })
  }
  private stamp() {
    return JSON.stringify([
      this.campaign.getSnapshot()._revision,
      this.customize.getSnapshot()._revision,
      this.dependency.getSnapshot()._revision,
      this.active.getSnapshot()._revision,
    ])
  }
  async prepareRemoval(
    localId: string,
    operation: 'uninstall' | 'deactivate',
    expectedType?: ContentType,
  ): Promise<RemovalPreview> {
    this.prune()
    const record = this.find(localId)
    if (expectedType && record.package.type !== expectedType)
      throw new AppError(ERRORS.CONTENT_TYPE_UNSUPPORTED)
    const paths = await this.paths()
    validateRecordPaths(record, paths)
    await safeGamePath(paths, relative(paths.gameRoot, record.managementDirectory))
    const active = this.active.getSnapshot().active[record.package.campaign!]
    if (operation === 'uninstall' && active?.localId === localId)
      throw new AppError(ERRORS.TASK_CONFLICT, {
        message: 'Deactivate before removing campaign library',
      })
    if (operation === 'deactivate' && active?.localId !== localId)
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
    if (operation === 'deactivate')
      validateActiveResources(
        record,
        {
          ...active!,
          resourceBackups: record.mode === 'ccm' ? undefined : active!.resourceBackups,
        },
        paths,
      )
    const files = operation === 'deactivate' ? active!.installedFiles : record.installedFiles
    if (
      operation === 'deactivate' &&
      record.files.some((file) => file.type === 'map') &&
      !files.some((file) => file.type === 'map')
    )
      throw new AppError(ERRORS.TASK_CONFLICT, {
        message:
          'Active map ownership is missing; rebuild the installation index before removing campaign markers',
      })
    const others = [
      ...[
        ...this.customize.getSnapshot().records,
        ...this.dependency.getSnapshot().records,
        ...this.campaign.getSnapshot().records.filter((record) => record.mode === 'ccm'),
      ]
        .filter((r) => r.gameRoot === paths.gameRoot)
        .map((r) => ({
          localId: r.localId,
          name: r.package.name,
          type: r.package.type as ContentType,
          files: r.installedFiles,
        })),
      ...Object.values(this.active.getSnapshot().active)
        .filter((a) => a.gameRoot === paths.gameRoot)
        .map((a) => ({
          localId: a.localId,
          name:
            this.campaign.getSnapshot().records.find((r) => r.localId === a.localId)?.package
              .name ?? a.localId,
          type: 'campaign' as const,
          files: a.installedFiles,
        })),
    ].filter((r) => r.localId !== localId)
    const preview: RemovalPreview = {
      removalId: randomUUID(),
      localId,
      operation,
      files: [],
    }
    const ownershipUnknown = operation === 'deactivate' && active?.ownershipUnknown === true
    if (record.mode === 'scnexus' || ownershipUnknown)
      for (const group of resourceGroups(files).filter(
        (group) =>
          ownershipUnknown || group.files.every((file) => !file.official && file.result !== 'kept'),
      )) {
        const usedBy = others
          .filter((o) =>
            resourceGroups(o.files).some(
              (other) => keyPath(other.target) === keyPath(group.target),
            ),
          )
          .map(({ files: _files, ...o }) => o)
        if (usedBy.length || ownershipUnknown)
          preview.files.push({
            conflictId: randomUUID(),
            file: {
              ...group.files[0]!,
              target: group.target,
              absolutePath: await safeGamePath(paths, group.target),
              bytes: group.files.reduce((sum, file) => sum + file.bytes, 0),
            },
            usedBy,
          })
      }
    const hashes = new Map<string, string | null>()
    for (const group of resourceGroups(files).filter(
      (group) =>
        (ownershipUnknown || group.files.every((file) => file.result !== 'kept')) &&
        (record.mode !== 'ccm' || group.files[0]!.type === 'map'),
    )) {
      const target = await safeGamePath(paths, group.target)
      hashes.set(group.target, (await resourceState(target))?.hash ?? null)
    }
    this.removals.set(preview.removalId, {
      preview,
      record,
      hashes,
      active: operation === 'deactivate',
      gameRevision: paths._revision,
      stamp: this.stamp(),
      expires: Date.now() + 30 * 60 * 1000,
    })
    return structuredClone(preview)
  }
  async remove(removalId: string, decisions: RemovalDecision[] = [], expectedType?: ContentType) {
    return this.operation(removalId, async () => {
      this.prune()
      const context = this.removals.get(removalId)
      if (!context || context.stamp !== this.stamp())
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: 'Removal preview expired',
        })
      const { record, preview } = context
      if (expectedType && record.package.type !== expectedType)
        throw new AppError(ERRORS.CONTENT_TYPE_UNSUPPORTED)
      const paths = await this.paths()
      if (context.gameRevision !== paths._revision)
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: 'Game configuration changed',
        })
      validateRecordPaths(record, paths)
      await safeGamePath(paths, relative(paths.gameRoot, record.managementDirectory))
      const choices = new Map<string, string>()
      if (!Array.isArray(decisions)) throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
      for (const d of decisions) {
        const file = preview.files.find((f) => f.conflictId === d.conflictId)
        if (!file || choices.has(file.file.target) || !['keep', 'delete'].includes(d.action))
          throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
        choices.set(file.file.target, d.action)
      }
      if (choices.size !== preview.files.length)
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: 'Unresolved shared file decisions',
        })
      const state = this.active.getSnapshot()
      const active = state.active[record.package.campaign!]
      if (context.active)
        validateActiveResources(
          record,
          {
            ...active!,
            resourceBackups: record.mode === 'ccm' ? undefined : active!.resourceBackups,
          },
          paths,
        )
      const files = context.active ? active!.installedFiles : record.installedFiles
      for (const [target, digest] of context.hashes) {
        if (choices.get(target) === 'keep') continue
        if (((await resourceState(await safeGamePath(paths, target)))?.hash ?? null) !== digest)
          throw new AppError(ERRORS.TASK_CONFLICT, {
            message: 'Removal resource changed; request a new preview',
          })
      }
      const removable = resourceGroups(files)
        .filter(
          (group) =>
            ((context.active && active?.ownershipUnknown) ||
              group.files.every((file) => file.result !== 'kept')) &&
            (record.mode !== 'ccm' || group.files[0]!.type === 'map'),
        )
        .flatMap((group) => group.files)
      await this.transaction(
        paths,
        async (write) => {
          for (const group of resourceGroups(removable)) {
            if (choices.get(group.target) === 'keep') continue
            await write(await safeGamePath(paths, group.target), null)
          }
          for (const backup of context.active && record.mode === 'scnexus'
            ? (active?.resourceBackups ?? [])
            : []) {
            const target = await safeGamePath(paths, backup.target)
            if (
              !resourceGroups(removable).some(
                (group) => keyPath(group.target) === keyPath(backup.target),
              ) ||
              choices.get(backup.target) === 'keep'
            )
              continue
            const backupRoot = join(record.managementDirectory, '.activation-backup')
            if (!below(backupRoot, backup.path) || backup.path === backupRoot)
              throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
            await safeGamePath(paths, relative(paths.gameRoot, backup.path))
            const saved = await resourceState(backup.path)
            if (!saved) throw new AppError(ERRORS.CAMPAIGN_RECOVERY_FAILED)
            if (saved.directory) {
              const stage = await mkdtemp(join(paths.gameRoot, '.scnexus-restore-'))
              try {
                await cp(backup.path, join(stage, 'resource'), { recursive: true })
                await write(target, { directory: join(stage, 'resource') })
              } finally {
                await rm(stage, { recursive: true, force: true })
              }
            } else await write(target, { file: backup.path })
            await write(backup.path, null)
          }
          if (context.active) {
            await write(
              await safeGamePath(
                paths,
                campaignRoots[record.package.campaign!][0] +
                  '/' +
                  (record.mode === 'ccm' ? 'metadata.txt' : 'package.json'),
              ),
              null,
            )
            if (record.mode === 'scnexus')
              await write(join(record.managementDirectory, 'active-manifest.json'), null)
            const next = { ...state.active }
            delete next[record.package.campaign!]
            this.active.update({ ...state, active: next })
          } else {
            if (record.external) await write(record.descriptorPath, null)
            const index = this.index(record.package.type as ContentType)
            const old = index.getSnapshot()
            index.update({
              ...old,
              records: old.records.filter((r) => r.localId !== record.localId),
            })
          }
        },
        context.active || record.external ? [] : [record.managementDirectory],
      )
      this.removals.delete(removalId)
      return { localId: record.localId, operation: preview.operation }
    })
  }
  async scan() {
    return this.lock(async () => {
      const paths = await this.paths()
      const { scanContent } = await import('./scanner')
      const result = await scanContent(
        paths,
        this.campaign.getSnapshot().records,
        this.active.getSnapshot().active,
      )
      const previous = [
        this.campaign.getSnapshot(),
        this.customize.getSnapshot(),
        this.dependency.getSnapshot(),
      ]
      const oldActive = this.active.getSnapshot()
      const stamp = Date.now()
      try {
        for (const [i, type] of (['campaign', 'customize', 'dependency'] as const).entries()) {
          const old = previous[i]
          const outside = old.records.filter((r) => r.gameRoot !== paths.gameRoot)
          const retained = old.records.filter(
            (r) =>
              r.gameRoot === paths.gameRoot &&
              result.diagnostics.some((d) => d.path === r.managementDirectory),
          )
          this.index(type).update({
            ...old,
            records: [
              ...outside,
              ...retained,
              ...result.records.filter((r) => r.package.type === type),
            ],
            scannedAt: stamp,
          })
        }
        const active = { ...result.active }
        for (const c of CAMPAIGNS) {
          const prior = oldActive.active[c]
          if (prior && result.diagnostics.some((d) => d.path === dirname(prior.descriptorPath)))
            active[c] = prior
        }
        this.active.update({ ...oldActive, active, scannedAt: stamp })
      } catch (cause) {
        this.campaign.update(previous[0])
        this.customize.update(previous[1])
        this.dependency.update(previous[2])
        this.active.update(oldActive)
        throw cause
      }
      return { ...result, scannedAt: stamp }
    })
  }
  list(type: ContentType) {
    return this.index(type).getSnapshot()
  }
  getActive() {
    return this.active.getSnapshot()
  }
}
export const contentService = new ContentService(
  getGamePaths,
  campaignRepository,
  customizeRepository,
  campaignActiveRepository,
  withGameLock,
  dependencyRepository,
)
