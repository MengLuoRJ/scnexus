import { validateCampaignRecord } from '../../stores/campaign'
import { validateCustomizeRecord } from '../../stores/customize'
import { validateActive } from '../../stores/campaign-active'
import { validateRecordPaths, validateActiveResources } from './content-package'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import type {
  ContentRecord,
  GamePaths,
  ActiveCampaign,
  PackageCampaignType,
} from '@scnexus/app-shared/types/content.type'
import { parsePackage, parseCcm, decodeCcm, buildPreview } from './parser'
import { isContentDiagnostic } from './diagnostics'
import { openSource, makeTree } from './source'
import { campaignRoots, CAMPAIGNS, safePath, officialMap, keyPath } from './paths'
import { resourceGroups } from './resources'
import { resourcePath } from '@scnexus/app-shared/utils/content-files'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
function parseManifest(raw: Buffer) {
  try {
    return JSON.parse(raw.toString())
  } catch (cause) {
    throw new AppError(
      ERRORS.ARCHIVE_METADATA_INVALID,
      { message: 'Invalid manifest JSON' },
      { cause },
    )
  }
}
async function optional(path: string) {
  try {
    return await readFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
export async function scanContent(
  paths: GamePaths,
  previousRecords: ContentRecord[] = [],
  previousActive: Partial<Record<PackageCampaignType, ActiveCampaign>> = {},
) {
  const records: ContentRecord[] = []
  const active: Partial<Record<PackageCampaignType, ActiveCampaign>> = {}
  const diagnostics: { path: string; message: string }[] = []
  const readDirectories = async (root: string) => {
    try {
      return await readdir(root, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }
  for (const dir of await readDirectories(paths.customizeDataRoot)) {
    if (!dir.isDirectory() || dir.isSymbolicLink()) continue
    const directory = await safePath(paths.gameRoot, 'SCNexusCustomizeData/' + dir.name)
    const raw = await optional(join(directory, 'install-manifest.json'))
    if (!raw) continue
    try {
      const record = parseManifest(raw) as ContentRecord
      if (record.package?.type === 'campaign') validateCampaignRecord(record)
      else validateCustomizeRecord(record)
      validateRecordPaths(record, paths)
      if (
        record.localId !== dir.name ||
        record.managementDirectory !== directory ||
        record.gameRoot !== paths.gameRoot ||
        record.mode !== 'scnexus' ||
        !Array.isArray(record.installedFiles) ||
        !Array.isArray(record.files)
      )
        throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, { message: 'Invalid manifest' })
      const packageRaw = await readFile(join(directory, 'package.json'))
      record.package = parsePackage(
        packageRaw.toString(),
        record.package.type as 'campaign' | 'customize',
      )
      for (const file of record.installedFiles) {
        const target = await safePath(paths.gameRoot, file.target)
        if (target !== file.absolutePath)
          throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, { message: 'Manifest path mismatch' })
      }
      if (record.package.type === 'customize') {
        const present = []
        for (const file of record.installedFiles) {
          const data = await optional(await safePath(paths.gameRoot, file.target))
          if (data) {
            file.bytes = data.length
            file.hash = createHash('sha256').update(data).digest('hex')
            present.push(file)
          } else
            diagnostics.push({
              path: file.absolutePath,
              message: 'Installed resource missing',
            })
        }
        record.installedFiles = present
      }
      records.push(record)
    } catch (error) {
      if (!isContentDiagnostic(error)) throw error
      diagnostics.push({
        path: directory,
        message: 'Invalid SCNexus package; retained old record if available',
      })
    }
  }
  async function* ccmDirectories(root: string): AsyncGenerator<{ directory: string; raw: Buffer }> {
    for (const dir of await readDirectories(root)) {
      if (!dir.isDirectory() || dir.isSymbolicLink()) continue
      const directory = await safePath(
        paths.gameRoot,
        relative(paths.gameRoot, join(root, dir.name)),
      )
      const raw = await optional(join(directory, 'metadata.txt'))
      if (raw) yield { directory, raw }
      else yield* ccmDirectories(directory)
    }
  }
  for await (const { directory, raw } of ccmDirectories(paths.ccmRoot)) {
    try {
      const decoded = decodeCcm(raw)
      const pkg = parseCcm(decoded.text)
      const source = await openSource({ kind: 'directory', path: directory })
      const preview = buildPreview(source, 'metadata.txt', pkg, true)
      records.push({
        localId:
          previousRecords.find(
            (record) =>
              record.mode === 'ccm' &&
              record.gameRoot === paths.gameRoot &&
              record.managementDirectory === directory,
          )?.localId ?? 'ccm-' + createHash('sha256').update(directory).digest('hex').slice(0, 24),
        package: pkg,
        mode: 'ccm',
        origin: 'metadata-txt',
        source: null,
        rootRelativePath: '',
        managementDirectory: directory,
        descriptorPath: join(directory, 'metadata.txt'),
        payloadDirectory: directory,
        ccmOriginal: decoded,
        files: preview.files,
        installedFiles: [],
        sourceTree: source.tree,
        targetTree: preview.targetTree,
        fileCount: preview.fileCount,
        bytes: preview.bytes,
        importedAt: Date.now(),
        gameRoot: paths.gameRoot,
      })
    } catch (error) {
      if (!isContentDiagnostic(error)) throw error
      diagnostics.push({ path: directory, message: 'Invalid CCM package' })
    }
  }
  const entries = []
  for (const prefix of ['Maps', 'Mods']) {
    const root = await safePath(paths.gameRoot, prefix)
    try {
      const source = await openSource({ kind: 'directory', path: root })
      entries.push(
        ...source.entries.map((entry) => ({
          ...entry,
          path: prefix + '/' + entry.path,
        })),
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  const gameSource = {
    input: { kind: 'directory' as const, path: paths.gameRoot },
    entries,
    tree: makeTree(entries, 'GameRoot'),
    read: async (path: string) => readFile(await safePath(paths.gameRoot, path)),
  }
  for (const campaign of CAMPAIGNS) {
    const directory = await safePath(paths.gameRoot, campaignRoots[campaign][0])
    const json = await optional(join(directory, 'package.json'))
    const txt = await optional(join(directory, 'metadata.txt'))
    if (!json && !txt) continue
    if (json && txt) {
      diagnostics.push({
        path: directory,
        message: 'Both campaign markers exist',
      })
      continue
    }
    try {
      const pkg = json ? parsePackage(json.toString(), 'campaign') : parseCcm(decodeCcm(txt!).text)
      if (pkg.campaign !== campaign)
        throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, { message: 'Campaign mismatch' })
      const matches = records.filter(
        (r) =>
          r.package.type === 'campaign' &&
          r.package.campaign === campaign &&
          r.mode === (json ? 'scnexus' : 'ccm') &&
          r.package.name === pkg.name &&
          r.package.author === pkg.author &&
          r.package.version === pkg.version,
      )
      const prior = previousActive[campaign]
      const priorMatch =
        !json && prior?.gameRoot === paths.gameRoot && prior.mode === 'ccm'
          ? matches.find((match) => match.localId === prior.localId)
          : undefined
      let record = priorMatch ?? (matches.length === 1 ? matches[0] : undefined)
      if (!json && matches.length > 1 && !priorMatch) {
        diagnostics.push({
          path: directory,
          message: 'Ambiguous CCM campaign; activation ownership cannot be rebuilt safely',
        })
        continue
      }
      if (json && matches.length > 1) {
        const marked = []
        for (const match of matches)
          if (await optional(join(match.managementDirectory, 'active-manifest.json')))
            marked.push(match)
        if (marked.length === 1) record = marked[0]
      }
      let saved: ActiveCampaign | undefined
      if (record && json) {
        const raw = await optional(join(record.managementDirectory, 'active-manifest.json'))
        if (raw) {
          saved = parseManifest(raw)
          validateActive(saved)
          if (saved?.localId !== record.localId || saved.gameRoot !== paths.gameRoot)
            throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {
              message: 'Invalid active manifest',
            })
        }
      }
      if (!json && record && prior?.localId === record.localId) {
        saved = { ...prior, resourceBackups: undefined }
        validateActiveResources(record, saved, paths)
      }
      if (!record) {
        const source = gameSource
        let preview
        if (json)
          preview = buildPreview(
            source,
            campaignRoots[campaign][0] + '/package.json',
            pkg,
            false,
            '',
          )
        else {
          const files = source.entries
            .filter((e) => officialMap(e.path, campaign))
            .map((e) => ({
              source: e.path,
              target: e.path,
              type: 'map' as const,
              official: true,
              bytes: e.bytes,
              modifiedAt: e.modifiedAt,
            }))
          preview = {
            files,
            targetTree: source.tree,
            fileCount: files.length,
            bytes: files.reduce((n, f) => n + f.bytes, 0),
          }
        }
        record = {
          external: true,
          localId: 'external-' + createHash('sha256').update(directory).digest('hex').slice(0, 24),
          package: pkg,
          mode: json ? 'scnexus' : 'ccm',
          origin: json ? 'package-json' : 'metadata-txt',
          source: null,
          rootRelativePath: '',
          managementDirectory: directory,
          descriptorPath: join(directory, json ? 'package.json' : 'metadata.txt'),
          payloadDirectory: null,
          ccmOriginal: txt ? decodeCcm(txt) : null,
          files: preview.files,
          installedFiles: [],
          sourceTree: null,
          targetTree: preview.targetTree,
          fileCount: preview.fileCount,
          bytes: preview.bytes,
          importedAt: Date.now(),
          gameRoot: paths.gameRoot,
        }
        records.push(record)
      }
      if (saved) validateActiveResources(record, saved, paths)
      const installed = saved?.installedFiles ?? []
      if (!saved) {
        const planned = json
          ? record.files
          : resourceGroups(record.files.filter((file) => file.type === 'map')).flatMap((group) =>
              gameSource.entries
                .filter((entry) => keyPath(resourcePath(entry.path)) === keyPath(group.target))
                .map((entry) => ({
                  ...group.files[0]!,
                  source: entry.path,
                  target: entry.path,
                  bytes: entry.bytes,
                  modifiedAt: entry.modifiedAt,
                })),
            )
        for (const file of planned) {
          const target = await safePath(paths.gameRoot, file.target)
          const data = await optional(target)
          if (data)
            installed.push({
              ...file,
              absolutePath: target,
              result: !json && !record.external ? 'kept' : 'copied',
              hash: createHash('sha256').update(data).digest('hex'),
            })
        }
      }
      for (const file of installed) {
        const target = await safePath(paths.gameRoot, file.target)
        if (target !== file.absolutePath)
          throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, { message: 'Invalid target path' })
      }
      active[campaign] = {
        localId: record.localId,
        campaign,
        mode: json ? 'scnexus' : 'ccm',
        descriptorPath: join(directory, json ? 'package.json' : 'metadata.txt'),
        installedFiles: installed,
        resourceBackups: saved?.resourceBackups,
        activatedAt: saved?.activatedAt ?? Date.now(),
        gameRoot: paths.gameRoot,
      }
    } catch (error) {
      if (!isContentDiagnostic(error)) throw error
      diagnostics.push({ path: directory, message: 'Invalid active campaign' })
    }
  }
  for (const entry of gameSource.entries.filter(
    (e) =>
      e.path.endsWith('/package.json') &&
      /^(Maps|Mods)\//.test(e.path) &&
      !e.path
        .split('/')
        .slice(0, -1)
        .some((part) => /\.sc2(map|mod)$/i.test(part)),
  )) {
    if (CAMPAIGNS.some((c) => entry.path === campaignRoots[c][0] + '/package.json')) continue
    try {
      const pkg = parsePackage((await gameSource.read(entry.path)).toString(), 'customize')
      const normalized = structuredClone(pkg)
      for (const category of ['maps', 'mods'] as const)
        for (const item of normalized[category] ?? [])
          item.source_path = item.target_path ?? item.source_path
      const preview = buildPreview(gameSource, entry.path, normalized, false, '')
      if (
        records.some(
          (r) =>
            r.package.type === 'customize' &&
            r.installedFiles.some((f) => preview.files.some((p) => p.target === f.target)),
        )
      ) {
        diagnostics.push({
          path: entry.path,
          message: 'External package overlaps a managed work; skipped duplicate',
        })
        continue
      }
      const directory = join(paths.gameRoot, entry.path, '..')
      const installedFiles = []
      for (const file of preview.files) {
        const absolutePath = await safePath(paths.gameRoot, file.target)
        const data = await readFile(absolutePath)
        installedFiles.push({
          ...file,
          absolutePath,
          result: 'copied' as const,
          hash: createHash('sha256').update(data).digest('hex'),
        })
      }
      records.push({
        external: true,
        localId: 'external-' + createHash('sha256').update(entry.path).digest('hex').slice(0, 24),
        package: pkg,
        mode: 'scnexus',
        origin: 'package-json',
        source: null,
        rootRelativePath: '',
        managementDirectory: directory,
        descriptorPath: join(paths.gameRoot, entry.path),
        payloadDirectory: null,
        ccmOriginal: null,
        files: preview.files,
        installedFiles,
        sourceTree: null,
        targetTree: preview.targetTree,
        fileCount: preview.fileCount,
        bytes: preview.bytes,
        importedAt: Date.now(),
        gameRoot: paths.gameRoot,
      })
    } catch (error) {
      if (!isContentDiagnostic(error)) throw error
      diagnostics.push({
        path: join(paths.gameRoot, entry.path, '..'),
        message: 'Invalid external customize package',
      })
    }
  }
  for (const entry of gameSource.entries.filter(
    (e) =>
      e.path.endsWith('/metadata.txt') &&
      e.path.startsWith('Maps/') &&
      !e.path.startsWith('Maps/CustomCampaigns/') &&
      !e.path
        .split('/')
        .slice(0, -1)
        .some((part) => /\.sc2(map|mod)$/i.test(part)),
  )) {
    if (CAMPAIGNS.some((c) => entry.path === campaignRoots[c][0] + '/metadata.txt')) continue
    try {
      const raw = await gameSource.read(entry.path)
      const decoded = decodeCcm(raw)
      const pkg = parseCcm(decoded.text)
      const preview = buildPreview(gameSource, entry.path, pkg, true)
      const directory = join(paths.gameRoot, entry.path, '..')
      records.push({
        external: true,
        localId: 'external-' + createHash('sha256').update(entry.path).digest('hex').slice(0, 24),
        package: pkg,
        mode: 'ccm',
        origin: 'metadata-txt',
        source: null,
        rootRelativePath: preview.rootRelativePath,
        managementDirectory: directory,
        descriptorPath: join(paths.gameRoot, entry.path),
        payloadDirectory: null,
        ccmOriginal: decoded,
        files: preview.files,
        installedFiles: [],
        sourceTree: null,
        targetTree: preview.targetTree,
        fileCount: preview.fileCount,
        bytes: preview.bytes,
        importedAt: Date.now(),
        gameRoot: paths.gameRoot,
      })
    } catch (error) {
      if (!isContentDiagnostic(error)) throw error
      diagnostics.push({
        path: join(paths.gameRoot, entry.path, '..'),
        message: 'Invalid external CCM metadata',
      })
    }
  }
  return { records, active, diagnostics }
}
