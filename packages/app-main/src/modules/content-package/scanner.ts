import { normalizeInstalledPackage } from '../../utils/installed-package'
import { validateCampaignRecord } from '../../stores/campaign'
import { validateDependencyRecord } from '../../stores/dependency'
import { validateCustomizeRecord } from '../../stores/customize'
import { validateActive } from '../../stores/campaign-active'
import { validateRecordPaths, validateActiveResources } from './content-package'
import { readdir, readFile, lstat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
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
import {
  campaignRoots,
  CAMPAIGNS,
  safePath,
  safeGamePath,
  gameAbsolutePath,
  gameLogicalPath,
  officialMap,
  keyPath,
} from './paths'
import { resourceGroups } from './resources'
import { restoreLauncher } from './launcher'
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
  const checkedPaths = new Map<string, Promise<string>>()
  const scanPath = (root: string, logical: string) => {
    const key = root + '\0' + logical
    let path = checkedPaths.get(key)
    if (!path) {
      path = root === paths.gameRoot ? safeGamePath(paths, logical) : safePath(root, logical)
      checkedPaths.set(key, path)
    }
    return path
  }
  const statCache = new Map<string, ReturnType<typeof lstat>>()
  const scanStat = (path: string) => {
    let info = statCache.get(path)
    if (!info) {
      info = lstat(path)
      statCache.set(path, info)
    }
    return info
  }
  const readDirectories = async (root: string) => {
    try {
      return await readdir(root, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }
  const entries: import('./source').Entry[] = []
  for (const prefix of ['Maps', 'Mods']) {
    const root = await scanPath(paths.gameRoot, prefix)
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
    read: async (path: string) => readFile(await scanPath(paths.gameRoot, path)),
  }
  for (const dir of await readDirectories(paths.customizeDataRoot)) {
    if (!dir.isDirectory() || dir.isSymbolicLink()) continue
    const directory = await scanPath(paths.gameRoot, 'SCNexusCustomizeData/' + dir.name)
    const raw = await optional(join(directory, 'install-manifest.json'))
    if (!raw) continue
    try {
      const record = parseManifest(raw) as ContentRecord
      record.package = normalizeInstalledPackage(record.package) as ContentRecord['package']
      if (record.package?.type === 'campaign') validateCampaignRecord(record)
      else if (record.package?.type === 'dependency') validateDependencyRecord(record)
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
        JSON.stringify(normalizeInstalledPackage(parseManifest(packageRaw))),
        record.package.type,
      )
      for (const file of record.installedFiles) {
        let target: string
        try {
          target = await scanPath(paths.gameRoot, file.target)
        } catch (error) {
          if (
            record.package.type === 'campaign' ||
            (error as NodeJS.ErrnoException).code !== 'ENOTDIR'
          )
            throw error
          target = gameAbsolutePath(paths, file.target)
        }
        if (target !== file.absolutePath)
          throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, { message: 'Manifest path mismatch' })
      }
      if (record.package.type !== 'campaign') {
        let shapeChanged = false
        for (const group of resourceGroups(record.installedFiles)) {
          const root = await scanPath(paths.gameRoot, group.target)
          let info
          try {
            info = await scanStat(root)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          }
          const directory = group.files.some(
            (file) => keyPath(file.target) !== keyPath(group.target),
          )
          if (info && info.isDirectory() !== directory) {
            shapeChanged = true
            diagnostics.push({
              path: root,
              message: 'Installed resource shape changed; retained installation record',
            })
          }
          if (group.files.some((file) => file.result === 'kept'))
            for (const file of group.files) file.result = 'kept'
        }
        for (const file of record.installedFiles) {
          let changed = false
          try {
            const parts = file.target.replaceAll('\\', '/').split('/')
            for (let index = 1; index < parts.length; index++) {
              const parent = await scanPath(paths.gameRoot, parts.slice(0, index).join('/'))
              if (!(await scanStat(parent)).isDirectory()) {
                changed = true
                break
              }
            }
            if (!changed) {
              const target = await scanPath(paths.gameRoot, file.target)
              changed = !(await scanStat(target)).isFile()
            }
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            if (code === 'ENOTDIR') changed = true
            else if (code !== 'ENOENT') throw error
          }
          if (changed) {
            shapeChanged = true
            diagnostics.push({
              path: file.absolutePath,
              message: 'Installed resource entry shape changed; retained installation record',
            })
          }
        }
        if (shapeChanged) {
          records.push(record)
          continue
        }
        const present = []
        for (const file of record.installedFiles) {
          const data = await optional(await scanPath(paths.gameRoot, file.target))
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
        record.files = present.map(
          ({ absolutePath: _absolutePath, result: _result, hash: _hash, ...file }) => file,
        )
        record.fileCount = present.length
        record.bytes = present.reduce((total, file) => total + file.bytes, 0)
        record.targetTree = makeTree(
          present.map((file) => ({
            path: file.target,
            bytes: file.bytes,
            modifiedAt: file.modifiedAt,
          })),
          'GameRoot',
        )
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
  async function* ccmDirectories(
    _root: string,
  ): AsyncGenerator<{ directory: string; raw: Buffer }> {
    const roots: string[] = []
    for (const entry of entries
      .filter(
        (entry) =>
          entry.path.startsWith('Maps/CustomCampaigns/') && entry.path.endsWith('/metadata.txt'),
      )
      .sort((a, b) => a.path.length - b.path.length)) {
      const logical = entry.path.slice(0, -'/metadata.txt'.length)
      if (
        logical.split('/').some((part) => /\.sc2(?:map|mod)$/i.test(part)) ||
        roots.some((root) => logical.startsWith(root + '/'))
      )
        continue
      roots.push(logical)
      const directory = await scanPath(paths.gameRoot, logical)
      yield { directory, raw: await readFile(join(directory, 'metadata.txt')) }
    }
  }
  for await (const { directory, raw } of ccmDirectories(paths.ccmRoot)) {
    try {
      const decoded = decodeCcm(raw)
      const pkg = parseCcm(decoded.text)
      const prefix = gameLogicalPath(paths, directory) + '/'
      const packageEntries = entries
        .filter((entry) => entry.path.startsWith(prefix))
        .map((entry) => ({ ...entry, path: entry.path.slice(prefix.length) }))
      const source = {
        input: { kind: 'directory' as const, path: directory },
        entries: packageEntries,
        tree: makeTree(packageEntries, directory.split(/[\\/]/).at(-1)!),
        read: async (path: string) => readFile(await scanPath(directory, path)),
      }
      const preview = buildPreview(source, 'metadata.txt', pkg, true)
      const previous = previousRecords.find(
        (record) =>
          record.mode === 'ccm' &&
          record.gameRoot === paths.gameRoot &&
          record.managementDirectory === directory,
      )
      records.push({
        ...(previous?.attachments ? { attachments: previous.attachments } : {}),
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
        rootRelativePath: previous?.attachments ? previous.rootRelativePath : '',
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
  for (const campaign of CAMPAIGNS) {
    const directory = await scanPath(paths.gameRoot, campaignRoots[campaign][0])
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
      const pkg = json
        ? parsePackage(JSON.stringify(normalizeInstalledPackage(parseManifest(json))), 'campaign')
        : parseCcm(decodeCcm(txt!).text)
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
          const target = await scanPath(paths.gameRoot, file.target)
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
        const target = await scanPath(paths.gameRoot, file.target)
        if (target !== file.absolutePath)
          throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, { message: 'Invalid target path' })
      }
      active[campaign] = {
        localId: record.localId,
        campaign,
        mode: json ? 'scnexus' : 'ccm',
        descriptorPath: join(directory, json ? 'package.json' : 'metadata.txt'),
        ownershipUnknown: saved?.ownershipUnknown ?? !saved,
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
      const pkg = parsePackage(
        JSON.stringify(normalizeInstalledPackage(parseManifest(await gameSource.read(entry.path)))),
        'customize',
      )
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
      const directory = dirname(gameAbsolutePath(paths, entry.path))
      const installedFiles = []
      for (const file of preview.files) {
        const absolutePath = await scanPath(paths.gameRoot, file.target)
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
        descriptorPath: gameAbsolutePath(paths, entry.path),
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
        path: dirname(gameAbsolutePath(paths, entry.path)),
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
      const directory = dirname(gameAbsolutePath(paths, entry.path))
      records.push({
        external: true,
        localId: 'external-' + createHash('sha256').update(entry.path).digest('hex').slice(0, 24),
        package: pkg,
        mode: 'ccm',
        origin: 'metadata-txt',
        source: null,
        rootRelativePath: preview.rootRelativePath,
        managementDirectory: directory,
        descriptorPath: gameAbsolutePath(paths, entry.path),
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
        path: dirname(gameAbsolutePath(paths, entry.path)),
        message: 'Invalid external CCM metadata',
      })
    }
  }
  for (const record of records) {
    if (record.package.type !== 'customize') continue
    const previous = previousRecords.find(
      (item) => item.localId === record.localId && item.gameRoot === record.gameRoot,
    )
    if (previous && Object.hasOwn(previous, 'launcherTarget')) {
      record.launcherTarget = previous.launcherTarget
      if (previous.launcherCustomized !== undefined) record.launcherCustomized = previous.launcherCustomized
    }
    try {
      restoreLauncher(record)
    } catch (error) {
      if (!isContentDiagnostic(error)) throw error
      record.launcherTarget = null
      diagnostics.push({
        path: record.managementDirectory,
        message: 'Installed launcher is missing or invalid',
      })
    }
  }
  return { records, active, diagnostics }
}
