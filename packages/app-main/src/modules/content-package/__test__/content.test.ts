import { test, expect, afterEach, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { ContentService, validateRecordPaths, validateActiveResources } from '../content-package'
import { scanContent } from '../scanner'
import { validateCustomizeRecord } from '../../../stores/customize'
import { parsePackage } from '../parser'
test('standard dependency packages are accepted separately from campaign content', () => {
  const value = {
    type: 'dependency',
    name: 'Core',
    description: '',
    version: '1',
    author: 'A',
    mods: [],
  }
  expect(parsePackage(JSON.stringify(value))).toEqual(value)
  expect(() => parsePackage(JSON.stringify(value), 'campaign')).toThrow(
    expect.objectContaining({ name: 'CONTENT-TYPE-UNSUPPORTED' }),
  )
})
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import type {
  ContentStore,
  CampaignActiveStoreData,
  Package,
  AnalysisResult,
} from '@scnexus/app-shared/types/content.type'
const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
function index<T extends { _revision: number }>(data: T) {
  return {
    getSnapshot: () => structuredClone(data),
    update(next: T) {
      data = structuredClone({ ...next, _revision: data._revision + 1 })
      return this.getSnapshot()
    },
  }
}
async function fixture(mapName = 'Maps', modName = 'Mods') {
  const root = await mkdtemp(join(process.cwd(), '.scnexus-content-'))
  roots.push(root)
  const game = join(root, 'game')
  await mkdir(game)
  await writeFile(join(game, 'StarCraft II.exe'), 'stub')
  const paths = {
    ...gamePaths(game, join(root, 'documents')),
    mapsRoot: join(game, mapName),
    modsRoot: join(game, modName),
    ccmRoot: join(game, mapName, 'CustomCampaigns'),
  }
  const campaign = index<ContentStore>({
    _schemaVersion: 2,
    _revision: 0,
    records: [],
    legacyRecords: [],
    scannedAt: null,
  })
  const customize = index<ContentStore>({
    _schemaVersion: 2,
    _revision: 0,
    records: [],
    legacyRecords: [],
    scannedAt: null,
  })
  const active = index<CampaignActiveStoreData>({
    _schemaVersion: 2,
    _revision: 0,
    active: {},
    legacyRecords: [],
    scannedAt: null,
  })
  const service = new ContentService(
    async () => paths,
    campaign,
    customize,
    active,
    async (run) => run(),
  )
  return { root, paths, service, campaign, customize, active }
}
async function source(root: string, files: Record<string, string>) {
  const dir = join(root, 'source-' + Math.random())
  await mkdir(dir)
  for (const [path, data] of Object.entries(files)) {
    await mkdir(join(dir, path, '..'), { recursive: true })
    await writeFile(join(dir, path), data)
  }
  return { kind: 'directory' as const, path: dir }
}
const pkg = (type: 'campaign' | 'customize', extra: Partial<Package> = {}): Package => ({
  name: 'Example',
  description: 'Example = Description',
  author: 'Tester',
  version: '1.0.0',
  type,
  ...(type === 'campaign' ? { campaign: 'WOL' as const } : {}),
  ...extra,
})
const decisions = (
  analysis: AnalysisResult,
  mode: 'scnexus' | 'ccm',
  action: 'keep' | 'overwrite' = 'overwrite',
) =>
  analysis.conflicts
    .find((c) => c.mode === mode)!
    .files.map((f) => ({ conflictId: f.conflictId, action }))
test('independent outermost valid descriptors, nested root, author recommendation and CCM conversion', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'package.json': 'invalid',
    'Project/package.json': JSON.stringify(pkg('campaign', { manager: 'CCM' })),
    'Project/Maps/Campaign/Level.SC2Map': 'map',
    'Project/metadata.txt': 'title=CCM\ndesc=x=y\nauthor=A\nversion=1\ncampaign=WOL',
    'Project/Mission.SC2Map': 'ccm map',
    'Project/Mods/Sub/Core.SC2Mod': 'mod',
  })
  const result = await f.service.analyze('campaign', input)
  expect(result.modes.scnexus?.rootRelativePath).toBe('Project')
  expect(result.modes.ccm?.package.description).toBe('x=y')
  expect(result.recommendedMode).toBe('ccm')
  expect(result.modes.auto).toBeNull()
  const justCcm = await source(f.root, {
    'Wrapper/metadata.txt': 'title=C\ndesc=d\nauthor=A\nversion=1\ncampaign=HOTS',
    'Wrapper/M.SC2Map': 'map',
    'Wrapper/evolution/E.SC2Map': 'e',
    'Wrapper/Mods/Sub/Core.SC2Mod': 'mod',
  })
  const converted = await f.service.analyze('campaign', justCcm)
  expect(converted.modes.scnexus?.origin).toBe('ccm-converted')
  expect(converted.modes.scnexus?.files.map((x) => x.target)).toContain('Mods/Sub/Core.SC2Mod')
  expect(converted.recommendedMode).toBeNull()
})
test('SCNexus campaign imports payload only, activates, scans and deactivates', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'Project/package.json': JSON.stringify(
      pkg('campaign', {
        campaign: 'LOTV',
        mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod' }],
      }),
    ),
    'Project/Maps/Campaign/void/Main.SC2Map': 'map',
    'Project/Maps/Campaign/voidprologue/Prologue.SC2Map': 'pro',
    'Project/Mods/Core.SC2Mod': 'mod',
  })
  const result = await f.service.analyze('campaign', input)
  const record = await f.service.install({
    analysisId: result.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  await expect(stat(join(f.paths.modsRoot, 'Core.SC2Mod'))).rejects.toMatchObject({
    code: 'ENOENT',
  })
  expect(
    await readFile(join(record.payloadDirectory!, 'Maps/Campaign/void/Main.SC2Map'), 'utf8'),
  ).toBe('map')
  const preview = await f.service.prepareActivation(record.localId)
  await f.service.activate(preview.activationId, [])
  expect(
    await readFile(join(f.paths.gameRoot, 'Maps/Campaign/voidprologue/Prologue.SC2Map'), 'utf8'),
  ).toBe('pro')
  const scanned = await f.service.scan()
  expect(scanned.active.LOTV?.localId).toBe(record.localId)
  const remove = await f.service.prepareRemoval(record.localId, 'deactivate')
  expect(remove.files).toEqual([])
  await f.service.remove(remove.removalId, [])
  await expect(
    stat(join(f.paths.gameRoot, 'Maps/Campaign/void/package.json')),
  ).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(record.payloadDirectory!, 'Mods/Core.SC2Mod'), 'utf8')).toBe('mod')
})
test('CCM import installs mods immediately, activation and removal never remove mods', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'Project/metadata.txt': 'title=C\ndesc=d\nauthor=A\nversion=1\ncampaign=HOTS',
    'Project/M.SC2Map': 'map',
    'Project/evolution/E.SC2Map': 'e',
    'Project/Mods/Sub/Core.SC2Mod': 'mod',
  })
  const result = await f.service.analyze('campaign', input)
  const record = await f.service.install({
    analysisId: result.analysisId,
    mode: 'ccm',
    decisions: [],
  })
  expect(await readFile(join(f.paths.modsRoot, 'Sub/Core.SC2Mod'), 'utf8')).toBe('mod')
  await expect(stat(join(f.paths.gameRoot, 'Maps/Campaign/swarm/M.SC2Map'))).rejects.toMatchObject({
    code: 'ENOENT',
  })
  const preview = await f.service.prepareActivation(record.localId)
  await f.service.activate(preview.activationId, [])
  expect(
    await readFile(join(f.paths.gameRoot, 'Maps/Campaign/swarm/metadata.txt'), 'utf8'),
  ).toContain('title=C')
  await expect(stat(join(record.managementDirectory, 'package.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  })
  const remove = await f.service.prepareRemoval(record.localId, 'deactivate')
  await f.service.remove(remove.removalId, [])
  const uninstall = await f.service.prepareRemoval(record.localId, 'uninstall')
  await f.service.remove(uninstall.removalId, [])
  expect(await readFile(join(f.paths.modsRoot, 'Sub/Core.SC2Mod'), 'utf8')).toBe('mod')
})
test.each([
  ['远征军之遗vs星系舰队混合体2'],
  ['远征军之遗vs星系舰队混合体2', '远征军之遗vs星系舰队混合体2'],
  ['Other CCM', 'Campaigns', '远征军之遗vs星系舰队混合体2'],
])(
  'scans CCM package depth %#: activation, rescan and uninstall use the actual package root',
  async (...parts) => {
    const f = await fixture()
    const directory = join(f.paths.ccmRoot, ...parts)
    await mkdir(directory, { recursive: true })
    const metadata = 'title=远征军之遗vs星系舰队混合体2\ndesc=d\nauthor=A\nversion=1\ncampaign=WOL'
    await writeFile(join(directory, 'metadata.txt'), metadata)
    await writeFile(join(directory, 'M.SC2Map'), 'nested map')
    const sibling = join(f.paths.ccmRoot, 'Unrelated.txt')
    await writeFile(sibling, 'keep')

    const scanned = await f.service.scan()
    expect(scanned.diagnostics).toEqual([])
    expect(scanned.records).toHaveLength(1)
    const record = scanned.records[0]
    expect(record).toMatchObject({
      mode: 'ccm',
      managementDirectory: directory,
      descriptorPath: join(directory, 'metadata.txt'),
      payloadDirectory: directory,
      files: [expect.objectContaining({ source: 'M.SC2Map', target: 'Maps/Campaign/M.SC2Map' })],
    })
    expect(f.campaign.getSnapshot().records[0]).toEqual(record)
    expect(() => validateRecordPaths(record, f.paths)).not.toThrow()
    for (const rejected of [
      f.paths.ccmRoot,
      join(f.paths.mapsRoot, 'Outside'),
      join(f.root, 'outside'),
    ]) {
      expect(() =>
        validateRecordPaths(
          {
            ...record,
            managementDirectory: rejected,
            descriptorPath: join(rejected, 'metadata.txt'),
            payloadDirectory: rejected,
          },
          f.paths,
        ),
      ).toThrow(expect.objectContaining({ code: 'M031' }))
    }

    const preview = await f.service.prepareActivation(record.localId)
    await f.service.activate(preview.activationId, [])
    const map = join(f.paths.mapsRoot, 'Campaign', 'M.SC2Map')
    expect(await readFile(map, 'utf8')).toBe('nested map')
    const rescanned = await f.service.scan()
    expect(rescanned.records).toHaveLength(1)
    expect(rescanned.records[0].localId).toBe(record.localId)
    expect(rescanned.active.WOL?.localId).toBe(record.localId)
    const deactivate = await f.service.prepareRemoval(record.localId, 'deactivate')
    await f.service.remove(deactivate.removalId, [])
    await expect(stat(map)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(record.descriptorPath, 'utf8')).toBe(metadata)
    const uninstall = await f.service.prepareRemoval(record.localId, 'uninstall')
    await f.service.remove(uninstall.removalId, [])
    await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(sibling, 'utf8')).toBe('keep')
    expect(f.campaign.getSnapshot().records).toEqual([])
  },
)
test('CCM scan finds sibling packages but does not split a marked package or follow directory links', async () => {
  const f = await fixture()
  const directories = [
    join(f.paths.ccmRoot, 'Wrapper', 'First'),
    join(f.paths.ccmRoot, 'Wrapper', 'Second'),
    join(f.paths.ccmRoot, 'Wrapper', 'First', 'Nested'),
    join(f.root, 'Outside'),
  ]
  for (const [i, directory] of directories.entries()) {
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'metadata.txt'), `title=Campaign ${i}\ncampaign=WOL`)
    await writeFile(join(directory, 'M.SC2Map'), 'map')
  }
  const link = join(f.paths.ccmRoot, 'Linked')
  await symlink(directories[3], link, 'junction')
  await expect(f.service.scan()).rejects.toMatchObject({ code: 'M031' })
  expect(f.campaign.getSnapshot().records).toEqual([])
  await rm(link)
  const result = await f.service.scan()
  expect(result.diagnostics).toEqual([])
  expect(result.records.map((record) => record.managementDirectory).sort()).toEqual(
    directories.slice(0, 2).sort(),
  )
})
test('customize resolves map and mod conflicts independently and shares removal references', async () => {
  const f = await fixture()
  await mkdir(f.paths.modsRoot, { recursive: true })
  await writeFile(join(f.paths.modsRoot, 'Shared.SC2Mod'), 'local')
  const packageValue = pkg('customize', {
    maps: [{ name: 'A.SC2Map', source_path: '/Maps/A.SC2Map' }],
    mods: [{ name: 'Shared.SC2Mod', source_path: '/Mods/Shared.SC2Mod' }],
  })
  const input = await source(f.root, {
    'package.json': JSON.stringify(packageValue),
    'Maps/A.SC2Map': 'new map',
    'Mods/Shared.SC2Mod': 'new mod',
  })
  const first = await f.service.analyze('customize', input)
  expect(first.conflicts[0].files[0].type).toBe('mod')
  const one = await f.service.install({
    analysisId: first.analysisId,
    mode: 'scnexus',
    decisions: decisions(first, 'scnexus', 'keep'),
  })
  expect(await readFile(join(f.paths.modsRoot, 'Shared.SC2Mod'), 'utf8')).toBe('local')
  const other = await source(f.root, {
    'package.json': JSON.stringify({ ...packageValue, name: 'Another work' }),
    'Maps/A.SC2Map': 'new map',
    'Mods/Shared.SC2Mod': 'new mod',
  })
  const second = await f.service.analyze('customize', other)
  expect(second.conflicts[0].files.map((c) => c.type).sort()).toEqual(['map', 'mod'])
  const two = await f.service.install({
    analysisId: second.analysisId,
    mode: 'scnexus',
    decisions: decisions(second, 'scnexus'),
  })
  const removal = await f.service.prepareRemoval(two.localId, 'uninstall')
  expect(removal.files).toHaveLength(2)
  await f.service.remove(
    removal.removalId,
    removal.files.map((c) => ({ conflictId: c.conflictId, action: 'keep' })),
  )
  expect(await readFile(join(f.paths.modsRoot, 'Shared.SC2Mod'), 'utf8')).toBe('new mod')
  expect(f.customize.getSnapshot().records.map((r) => r.localId)).toEqual([one.localId])
})
test('ZIP input and source changes reject stale installation without touching source', async () => {
  const f = await fixture()
  const inputFolder = await source(f.root, {
    'Nested/package.json': JSON.stringify(
      pkg('customize', {
        maps: [{ name: 'A.SC2Map', source_path: '/Maps/A.SC2Map' }],
      }),
    ),
    'Nested/Maps/A.SC2Map': 'map',
  })
  const { sevenZip } = await import('../../../utils/7zip-wrapper')
  const archive = join(f.root, 'input.zip')
  await sevenZip.add(archive, ['Nested'], {
    cwd: inputFolder.path,
    archiveType: 'zip',
  })
  const analysis = await f.service.analyze('customize', {
    kind: 'archive',
    path: archive,
  })
  expect(analysis.modes.scnexus?.rootRelativePath).toBe('Nested')
  await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  expect(await readFile(join(f.paths.mapsRoot, 'A.SC2Map'), 'utf8')).toBe('map')
  const input = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('customize', {
        maps: [{ name: 'B.SC2Map', source_path: '/Maps/B.SC2Map' }],
      }),
    ),
    'Maps/B.SC2Map': 'before',
  })
  const stale = await f.service.analyze('customize', input)
  await writeFile(join(input.path, 'Maps/B.SC2Map'), 'changed')
  await expect(
    f.service.install({
      analysisId: stale.analysisId,
      mode: 'scnexus',
      decisions: [],
    }),
  ).rejects.toMatchObject({ code: 'M051' })
  expect(await readFile(join(input.path, 'Maps/B.SC2Map'), 'utf8')).toBe('changed')
})
test('WOL excludes other campaigns, traversal and ambiguous roots are unavailable', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'package.json': JSON.stringify(pkg('campaign')),
    'Maps/Campaign/W.SC2Map': 'wol',
    'Maps/Campaign/swarm/H.SC2Map': 'hots',
  })
  const result = await f.service.analyze('campaign', input)
  expect(result.modes.scnexus?.files).toHaveLength(1)
  const bad = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('customize', {
        maps: [{ name: 'M.SC2Map', source_path: '/Maps/../M.SC2Map' }],
      }),
    ),
    'M.SC2Map': 'bad',
  })
  expect((await f.service.analyze('customize', bad)).modes.scnexus).toBeNull()
  const twin = await source(f.root, {
    'A/package.json': JSON.stringify(pkg('campaign')),
    'B/package.json': JSON.stringify(pkg('campaign')),
    'A/Maps/Campaign/M.SC2Map': 'a',
    'B/Maps/Campaign/M.SC2Map': 'b',
  })
  expect((await f.service.analyze('campaign', twin)).modes.scnexus).toBeNull()
})
test('components report one resource conflict and keep the complete local group', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('customize', {
        mods: [
          {
            name: 'Core.SC2Mod',
            source_path: '/Mods/Core.SC2Mod',
            components: true,
          },
        ],
      }),
    ),
    'Mods/Core.SC2Mod/a': 'a',
    'Mods/Core.SC2Mod/b': 'b',
  })
  await mkdir(join(f.paths.modsRoot, 'Core.SC2Mod'), { recursive: true })
  await writeFile(join(f.paths.modsRoot, 'Core.SC2Mod/a'), 'old a')
  await writeFile(join(f.paths.modsRoot, 'Core.SC2Mod/b'), 'old b')
  const result = await f.service.analyze('customize', input)
  const files = result.conflicts[0].files
  expect(files).toHaveLength(1)
  expect(files[0].local.path).toBe(join(f.paths.modsRoot, 'Core.SC2Mod'))
  await f.service.install({
    analysisId: result.analysisId,
    mode: 'scnexus',
    decisions: files.map((f) => ({
      conflictId: f.conflictId,
      action: 'keep',
    })),
  })
  expect(await readFile(join(f.paths.modsRoot, 'Core.SC2Mod/a'), 'utf8')).toBe('old a')
  expect(await readFile(join(f.paths.modsRoot, 'Core.SC2Mod/b'), 'utf8')).toBe('old b')
})
test.each(['file-to-directory', 'directory-to-file', 'directory-to-directory'])(
  'campaign resource %s replaces the whole target, survives scan and restores the original',
  async (shape) => {
    const f = await fixture()
    const target = join(f.paths.mapsRoot, 'Campaign', 'Mission.SC2Map')
    await mkdir(join(f.paths.mapsRoot, 'Campaign'), { recursive: true })
    if (shape === 'file-to-directory') await writeFile(target, 'official archive')
    else {
      await mkdir(join(target, 'Empty'), { recursive: true })
      await writeFile(join(target, 'old-only'), 'official component')
    }
    const input = await source(f.root, {
      'metadata.txt': 'title=Grouped\ncampaign=WOL',
      ...(shape === 'directory-to-file'
        ? { 'Mission.SC2Map': 'custom archive' }
        : {
            'Mission.SC2Map/DocumentInfo': 'custom info',
            'Mission.SC2Map/Base.SC2Data/a': 'custom component',
          }),
    })
    if (shape !== 'directory-to-file')
      await mkdir(join(input.path, 'Mission.SC2Map', 'IncomingEmpty'))
    const analysis = await f.service.analyze('campaign', input)
    const installed = await f.service.install({
      analysisId: analysis.analysisId,
      mode: 'scnexus',
      decisions: [],
    })
    const preview = await f.service.prepareActivation(installed.localId)
    expect(preview.conflicts).toHaveLength(1)
    expect(preview.conflicts[0].local.path).toBe(target)
    await f.service.activate(
      preview.activationId,
      preview.conflicts.map((conflict) => ({
        conflictId: conflict.conflictId,
        action: 'overwrite',
      })),
    )
    expect(
      await readFile(shape === 'directory-to-file' ? target : join(target, 'DocumentInfo'), 'utf8'),
    ).toBe(shape === 'directory-to-file' ? 'custom archive' : 'custom info')
    const incomingEmpty = await stat(join(target, 'IncomingEmpty')).then(
      (info) => info.isDirectory(),
      (error: NodeJS.ErrnoException) => error.code,
    )
    expect(incomingEmpty).toBe(
      shape === 'directory-to-file' ? (process.platform === 'win32' ? 'ENOENT' : 'ENOTDIR') : true,
    )
    await expect(stat(join(target, 'old-only'))).rejects.toMatchObject({
      code:
        shape === 'directory-to-file'
          ? process.platform === 'win32'
            ? 'ENOENT'
            : 'ENOTDIR'
          : 'ENOENT',
    })
    const scanned = await f.service.scan()
    expect(scanned.active.WOL?.resourceBackups).toHaveLength(1)
    let failedRestore: unknown
    let retainedMap: string | undefined
    let retainedBackup: string | undefined
    if (shape === 'file-to-directory') {
      const failing = new ContentService(
        async () => f.paths,
        f.campaign,
        f.customize,
        {
          getSnapshot: f.active.getSnapshot,
          update() {
            throw Error('restore state failed')
          },
        },
        async (run) => run(),
      )
      const removal = await failing.prepareRemoval(installed.localId, 'deactivate')
      failedRestore = await failing.remove(removal.removalId, []).then(
        () => undefined,
        (error: unknown) => error,
      )
      retainedMap = await readFile(join(target, 'DocumentInfo'), 'utf8')
      retainedBackup = await readFile(scanned.active.WOL!.resourceBackups![0]!.path, 'utf8')
    }
    expect(failedRestore).toEqual(
      shape === 'file-to-directory' ? new Error('restore state failed') : undefined,
    )
    expect(retainedMap).toBe(shape === 'file-to-directory' ? 'custom info' : undefined)
    expect(retainedBackup).toBe(shape === 'file-to-directory' ? 'official archive' : undefined)
    const removal = await f.service.prepareRemoval(installed.localId, 'deactivate')
    await f.service.remove(removal.removalId, [])
    expect(
      await readFile(shape === 'file-to-directory' ? target : join(target, 'old-only'), 'utf8'),
    ).toBe(shape === 'file-to-directory' ? 'official archive' : 'official component')
    const restoredEmpty = await stat(join(target, 'Empty')).then(
      (info) => info.isDirectory(),
      (error: NodeJS.ErrnoException) => error.code,
    )
    expect(restoredEmpty).toBe(
      shape === 'file-to-directory' ? (process.platform === 'win32' ? 'ENOENT' : 'ENOTDIR') : true,
    )
    await expect(stat(join(target, 'DocumentInfo'))).rejects.toMatchObject({
      code:
        shape === 'file-to-directory'
          ? process.platform === 'win32'
            ? 'ENOENT'
            : 'ENOTDIR'
          : 'ENOENT',
    })
    const uninstall = await f.service.prepareRemoval(installed.localId, 'uninstall')
    await f.service.remove(uninstall.removalId, [])
    await expect(stat(installed.managementDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
  },
)
test('component changes anywhere in a resource invalidate the conflict preview', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('customize', {
        mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod', components: true }],
      }),
    ),
    'Mods/Core.SC2Mod/a': 'incoming',
  })
  const target = join(f.paths.modsRoot, 'Core.SC2Mod')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'a'), 'old')
  const preview = await f.service.analyze('customize', input)
  await writeFile(join(target, 'new-unlisted'), 'added after preview')
  await expect(
    f.service.install({
      analysisId: preview.analysisId,
      mode: 'scnexus',
      decisions: decisions(preview, 'scnexus'),
    }),
  ).rejects.toMatchObject({ code: 'M051' })
  expect(await readFile(join(target, 'a'), 'utf8')).toBe('old')
})
test.each(['scnexus', 'ccm'] as const)(
  '%s activation rollback preserves a complete original resource when saving state fails',
  async (mode) => {
    const f = await fixture()
    const target = join(f.paths.mapsRoot, 'Campaign', 'Mission.SC2Map')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'old-only'), 'original')
    const input = await source(f.root, {
      'metadata.txt': 'title=Rollback\ncampaign=WOL',
      'Mission.SC2Map': 'archive',
    })
    const preview = await f.service.analyze('campaign', input)
    const installed = await f.service.install({
      analysisId: preview.analysisId,
      mode,
      decisions: [],
    })
    const failing = new ContentService(
      async () => f.paths,
      f.campaign,
      f.customize,
      {
        getSnapshot: f.active.getSnapshot,
        update() {
          throw Error('state failed')
        },
      },
      async (run) => run(),
    )
    const activation = await failing.prepareActivation(installed.localId)
    await expect(
      failing.activate(
        activation.activationId,
        activation.conflicts.map((item) => ({ conflictId: item.conflictId, action: 'overwrite' })),
      ),
    ).rejects.toThrow('state failed')
    expect((await stat(target)).isDirectory()).toBe(true)
    expect(await readFile(join(target, 'old-only'), 'utf8')).toBe('original')
    expect(f.active.getSnapshot().active.WOL).toBeUndefined()
    await expect(
      stat(join(installed.managementDirectory, 'active-manifest.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  },
)
test('CCM grouped map activation uses only the index and no persistent package backup', async () => {
  const f = await fixture()
  const target = join(f.paths.mapsRoot, 'Campaign', 'Mission.SC2Map')
  await mkdir(join(f.paths.mapsRoot, 'Campaign'), { recursive: true })
  await writeFile(target, 'original')
  const input = await source(f.root, {
    'metadata.txt': 'title=CCM Group\ncampaign=WOL',
    'Mission.SC2Map/a': 'group',
  })
  const analysis = await f.service.analyze('campaign', input)
  const installed = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'ccm',
    decisions: [],
  })
  const activation = await f.service.prepareActivation(installed.localId)
  await f.service.activate(
    activation.activationId,
    activation.conflicts.map((item) => ({ conflictId: item.conflictId, action: 'overwrite' })),
  )
  await expect(
    stat(join(installed.managementDirectory, 'active-manifest.json')),
  ).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(
    stat(join(installed.managementDirectory, '.activation-backup')),
  ).rejects.toMatchObject({ code: 'ENOENT' })
  await f.service.scan()
  const removal = await f.service.prepareRemoval(installed.localId, 'deactivate')
  await f.service.remove(removal.removalId, [])
  await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
})
test('direct group replacement removes stale members, detects removal changes and uninstalls the resource', async () => {
  const f = await fixture()
  const target = join(f.paths.modsRoot, 'Core.SC2Mod')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'old-only'), 'old')
  const input = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('customize', {
        mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod', components: true }],
      }),
    ),
    'Mods/Core.SC2Mod/a': 'new',
    'Mods/Core.SC2Mod/b': 'new b',
  })
  const analysis = await f.service.analyze('customize', input)
  const installed = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'scnexus',
    decisions: decisions(analysis, 'scnexus'),
  })
  await expect(stat(join(target, 'old-only'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(target, 'a'), 'utf8')).toBe('new')
  const removal = await f.service.prepareRemoval(installed.localId, 'uninstall')
  await writeFile(join(target, 'changed'), 'added')
  await expect(f.service.remove(removal.removalId, [])).rejects.toMatchObject({ code: 'M051' })
  const retry = await f.service.prepareRemoval(installed.localId, 'uninstall')
  await f.service.remove(retry.removalId, [])
  await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
})
test('shared components produce one removal decision for the whole resource', async () => {
  const f = await fixture()
  const make = async (name: string, member: string) =>
    source(f.root, {
      'package.json': JSON.stringify(
        pkg('customize', {
          name,
          mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod', components: true }],
        }),
      ),
      ['Mods/Core.SC2Mod/' + member]: name,
    })
  const first = await f.service.analyze('customize', await make('First', 'a'))
  const record = await f.service.install({
    analysisId: first.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  const second = await f.service.analyze('customize', await make('Second', 'b'))
  await f.service.install({
    analysisId: second.analysisId,
    mode: 'scnexus',
    decisions: decisions(second, 'scnexus', 'keep'),
  })
  const preview = await f.service.prepareRemoval(record.localId, 'uninstall')
  expect(preview.files).toHaveLength(1)
  expect(preview.files[0].file.target).toBe('Mods/Core.SC2Mod')
  await f.service.remove(preview.removalId, [
    { conflictId: preview.files[0].conflictId, action: 'keep' },
  ])
  expect(await readFile(join(f.paths.modsRoot, 'Core.SC2Mod', 'a'), 'utf8')).toBe('First')
})
test('CCM scan retains all source resource plans for consistent dual counts without claiming installed Mods', async () => {
  const f = await fixture()
  const directory = join(f.paths.ccmRoot, 'Grouped')
  await mkdir(join(directory, 'Mission.SC2Map'), { recursive: true })
  await mkdir(join(directory, 'Mods', 'Core.SC2Mod'), { recursive: true })
  await writeFile(join(directory, 'metadata.txt'), 'title=Grouped\ncampaign=WOL')
  await writeFile(join(directory, 'Mission.SC2Map', 'a'), 'a')
  await writeFile(join(directory, 'Mods', 'Core.SC2Mod', 'a'), 'a')
  await writeFile(join(directory, 'Mods', 'Core.SC2Mod', 'b'), 'b')
  const scanned = await f.service.scan()
  const record = scanned.records[0]
  expect(record.fileCount).toBe(3)
  expect(record.files).toHaveLength(3)
  expect(record.files.filter((file) => file.type === 'mod')).toHaveLength(2)
  expect(record.installedFiles).toEqual([])
  const activation = await f.service.prepareActivation(record.localId)
  expect(activation.files).toHaveLength(1)
})
test.each([
  ['file', 'overwrite'],
  ['directory', 'overwrite'],
  ['file', 'keep'],
  ['directory', 'keep'],
] as const)(
  'customize replaces or keeps the complete %s resource with %s',
  async (shape, action) => {
    const f = await fixture()
    const target = join(f.paths.modsRoot, 'Core.SC2Mod')
    await mkdir(f.paths.modsRoot, { recursive: true })
    if (shape === 'file') await writeFile(target, 'old archive')
    else {
      await mkdir(target)
      await writeFile(join(target, 'old-only'), 'old group')
    }
    const component = shape === 'file'
    const input = await source(f.root, {
      'package.json': JSON.stringify(
        pkg('customize', {
          mods: [
            {
              name: 'Core.SC2Mod',
              source_path: '/Mods/Core.SC2Mod',
              ...(component ? { components: true } : {}),
            },
          ],
        }),
      ),
      ...(component
        ? { 'Mods/Core.SC2Mod/new': 'new group' }
        : { 'Mods/Core.SC2Mod': 'new archive' }),
    })
    const preview = await f.service.analyze('customize', input)
    expect(preview.conflicts[0].files).toHaveLength(1)
    const installed = await f.service.install({
      analysisId: preview.analysisId,
      mode: 'scnexus',
      decisions: decisions(preview, 'scnexus', action),
    })
    const expectedContent =
      action === 'keep'
        ? shape === 'file'
          ? 'old archive'
          : 'old group'
        : component
          ? 'new group'
          : 'new archive'
    const contentPath =
      action === 'keep'
        ? shape === 'file'
          ? target
          : join(target, 'old-only')
        : component
          ? join(target, 'new')
          : target
    expect(await readFile(contentPath, 'utf8')).toBe(expectedContent)
    expect(installed.installedFiles.every((file) => file.result === 'kept')).toBe(action === 'keep')
    const removal = await f.service.prepareRemoval(installed.localId, 'uninstall')
    await f.service.remove(removal.removalId, [])
    const remaining = await stat(target).then(
      () => 'present',
      (error: NodeJS.ErrnoException) => error.code,
    )
    expect(remaining).toBe(action === 'keep' ? 'present' : 'ENOENT')
  },
)
test.each(['single', 'group'] as const)(
  'CCM scan preserves kept local ownership for %s sources even with duplicate metadata',
  async (shape) => {
    const f = await fixture()
    const target = join(f.paths.mapsRoot, 'Campaign', 'Mission.SC2Map')
    await mkdir(join(f.paths.mapsRoot, 'Campaign'), { recursive: true })
    await writeFile(target, 'user map')
    const input = await source(f.root, {
      'metadata.txt': 'title=Kept\ncampaign=WOL',
      ...(shape === 'group'
        ? { 'Mission.SC2Map/a': 'incoming' }
        : { 'Mission.SC2Map': 'incoming' }),
    })
    const analysis = await f.service.analyze('campaign', input)
    const record = await f.service.install({
      analysisId: analysis.analysisId,
      mode: 'ccm',
      decisions: [],
    })
    const activation = await f.service.prepareActivation(record.localId)
    await f.service.activate(
      activation.activationId,
      activation.conflicts.map((item) => ({ conflictId: item.conflictId, action: 'keep' })),
    )
    const duplicate = join(f.paths.ccmRoot, 'wrapper', 'Kept')
    await mkdir(duplicate, { recursive: true })
    await writeFile(join(duplicate, 'metadata.txt'), 'title=Kept\ncampaign=WOL')
    await writeFile(join(duplicate, 'Mission.SC2Map'), 'duplicate')
    const scanned = await f.service.scan()
    expect(scanned.active.WOL?.localId).toBe(record.localId)
    expect(scanned.active.WOL?.installedFiles.every((file) => file.result === 'kept')).toBe(true)
    const removal = await f.service.prepareRemoval(record.localId, 'deactivate')
    await f.service.remove(removal.removalId, [])
    expect(await readFile(target, 'utf8')).toBe('user map')
  },
)
test('CCM scan diagnoses ambiguous identity without trusting package-side activation markers', async () => {
  const f = await fixture()
  for (const name of ['First', 'Second']) {
    const directory = join(f.paths.ccmRoot, name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'metadata.txt'), 'title=Same\ncampaign=WOL')
    await writeFile(join(directory, 'M.SC2Map'), 'map')
    await writeFile(join(directory, 'active-manifest.json'), 'malformed untrusted JSON')
  }
  const activeRoot = join(f.paths.mapsRoot, 'Campaign')
  await mkdir(activeRoot, { recursive: true })
  await writeFile(join(activeRoot, 'metadata.txt'), 'title=Same\ncampaign=WOL')
  await writeFile(join(activeRoot, 'M.SC2Map'), 'map')
  const result = await f.service.scan()
  expect(result.active.WOL).toBeUndefined()
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ message: expect.stringContaining('Ambiguous CCM') }),
  )
})
test('CCM without trusted activation index conservatively preserves discovered maps', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'metadata.txt': 'title=Indexed\ncampaign=WOL',
    'M.SC2Map': 'map',
  })
  const analysis = await f.service.analyze('campaign', input)
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'ccm',
    decisions: [],
  })
  const activation = await f.service.prepareActivation(record.localId)
  await f.service.activate(activation.activationId, [])
  const rebuilt = await scanContent(f.paths, f.campaign.getSnapshot().records)
  expect(rebuilt.active.WOL?.installedFiles[0].result).toBe('kept')
})
test.each(['ccm', 'scnexus'] as const)(
  '%s rejects executable targets from forged active metadata without modifying game files',
  async (mode) => {
    const f = await fixture()
    const input = await source(f.root, {
      'metadata.txt': 'title=Untrusted\ncampaign=WOL',
      'M.SC2Map': 'map',
    })
    const analysis = await f.service.analyze('campaign', input)
    const record = await f.service.install({ analysisId: analysis.analysisId, mode, decisions: [] })
    const activation = await f.service.prepareActivation(record.localId)
    const active = await f.service.activate(activation.activationId, [])
    const target = join(f.paths.gameRoot, 'Support64', 'SC2Switcher_x64.exe')
    await mkdir(join(f.paths.gameRoot, 'Support64'), { recursive: true })
    await writeFile(target, 'original executable')
    const backup = join(record.managementDirectory, '.activation-backup', 'forged')
    await mkdir(join(record.managementDirectory, '.activation-backup'), { recursive: true })
    await writeFile(backup, 'untrusted replacement')
    const forged = {
      ...active,
      installedFiles: [
        {
          ...active.installedFiles[0],
          target: 'Support64/SC2Switcher_x64.exe',
          absolutePath: target,
        },
      ],
      resourceBackups: [{ target: 'Support64/SC2Switcher_x64.exe', path: backup }],
    }
    await writeFile(
      join(record.managementDirectory, 'active-manifest.json'),
      JSON.stringify(forged),
    )
    const scanned =
      mode === 'ccm'
        ? await f.service.scan()
        : await scanContent(f.paths, f.campaign.getSnapshot().records)
    expect(scanned.active.WOL?.installedFiles[0].target).toBe(
      mode === 'ccm' ? 'Maps/Campaign/M.SC2Map' : undefined,
    )
    expect(scanned.active.WOL?.resourceBackups).toBeUndefined()
    expect(scanned.active.WOL === undefined).toBe(mode === 'scnexus')
    expect(scanned.diagnostics.length > 0).toBe(mode === 'scnexus')
    if (mode === 'scnexus')
      f.active.update({ ...f.active.getSnapshot(), active: { WOL: forged } } as never)
    const removalResult = await f.service.prepareRemoval(record.localId, 'deactivate').then(
      async (removal) => {
        await f.service.remove(removal.removalId, [])
        return undefined
      },
      (error: unknown) => error,
    )
    const rejectedRemoval = expect.objectContaining({ code: 'M031' })
    expect(removalResult).toEqual(mode === 'ccm' ? undefined : rejectedRemoval)
    expect(await readFile(backup, 'utf8')).toBe('untrusted replacement')
    expect(await readFile(target, 'utf8')).toBe('original executable')
  },
)
test('SCNexus active authorization rejects undeclared resources, incorrect scope and invalid backup associations', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'metadata.txt': 'title=Authorization\ncampaign=WOL',
    'M.SC2Map': 'map',
  })
  const analysis = await f.service.analyze('campaign', input)
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  const preview = await f.service.prepareActivation(record.localId)
  const active = await f.service.activate(preview.activationId, [])
  for (const target of [
    'Maps/Campaign/Other.SC2Map',
    'Maps/Campaign/swarm/M.SC2Map',
    'Mods/Other.SC2Mod',
  ]) {
    const forged = {
      ...active,
      installedFiles: [
        { ...active.installedFiles[0]!, target, absolutePath: join(f.paths.gameRoot, target) },
      ],
    }
    expect(() => validateActiveResources(record, forged, f.paths)).toThrow(
      expect.objectContaining({ code: 'M031' }),
    )
  }
  for (const backup of [
    {
      target: 'Maps/Campaign/Other.SC2Map',
      path: join(record.managementDirectory, '.activation-backup', 'item'),
    },
    { target: 'Maps/Campaign/M.SC2Map', path: join(f.root, 'outside') },
    {
      target: 'Maps/Campaign/M.SC2Map',
      path: join(record.managementDirectory, '.activation-backup', 'nested', 'item'),
    },
  ]) {
    expect(() =>
      validateActiveResources(record, { ...active, resourceBackups: [backup] }, f.paths),
    ).toThrow(expect.objectContaining({ code: 'M031' }))
  }
})
test('scanning missing legacy kept members never grants whole-group deletion ownership', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('customize', {
        mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod', components: true }],
      }),
    ),
    'Mods/Core.SC2Mod/a': 'a',
    'Mods/Core.SC2Mod/b': 'b',
  })
  const analysis = await f.service.analyze('customize', input)
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  record.installedFiles[0].result = 'kept'
  await writeFile(join(record.managementDirectory, 'install-manifest.json'), JSON.stringify(record))
  await rm(record.installedFiles[0].absolutePath)
  const added = join(f.paths.modsRoot, 'Core.SC2Mod', 'user-added')
  await writeFile(added, 'user content')
  for (let i = 0; i < 2; i++) {
    await f.service.scan()
    const scanned = f.customize.getSnapshot().records[0]
    expect(scanned.installedFiles).toHaveLength(1)
    expect(scanned.installedFiles[0].result).toBe('kept')
  }
  const removal = await f.service.prepareRemoval(record.localId, 'uninstall')
  await f.service.remove(removal.removalId, [])
  expect(await readFile(added, 'utf8')).toBe('user content')
  expect(await readFile(join(f.paths.modsRoot, 'Core.SC2Mod', 'b'), 'utf8')).toBe('b')
})
test.each(['file-to-directory', 'directory-to-file'] as const)(
  'scan isolates externally changed %s resource shapes and retains records',
  async (shape) => {
    const f = await fixture()
    const grouped = shape === 'directory-to-file'
    const input = await source(f.root, {
      'package.json': JSON.stringify(
        pkg('customize', {
          mods: [
            {
              name: 'Core.SC2Mod',
              source_path: '/Mods/Core.SC2Mod',
              ...(grouped ? { components: true } : {}),
            },
          ],
        }),
      ),
      ...(grouped ? { 'Mods/Core.SC2Mod/a': 'group' } : { 'Mods/Core.SC2Mod': 'packed' }),
    })
    const analysis = await f.service.analyze('customize', input)
    const record = await f.service.install({
      analysisId: analysis.analysisId,
      mode: 'scnexus',
      decisions: [],
    })
    const target = join(f.paths.modsRoot, 'Core.SC2Mod')
    await rm(target, { recursive: true })
    if (grouped) await writeFile(target, 'external packed')
    else {
      await mkdir(target)
      await writeFile(join(target, 'a'), 'external group')
    }
    const valid = await source(f.root, {
      'package.json': JSON.stringify(
        pkg('customize', {
          name: 'Other',
          mods: [{ name: 'Other.SC2Mod', source_path: '/Mods/Other.SC2Mod' }],
        }),
      ),
      'Mods/Other.SC2Mod': 'valid',
    })
    const validAnalysis = await f.service.analyze('customize', valid)
    const other = await f.service.install({
      analysisId: validAnalysis.analysisId,
      mode: 'scnexus',
      decisions: [],
    })
    for (let i = 0; i < 2; i++) {
      const scan = await f.service.scan()
      expect(scan.diagnostics).toContainEqual({
        path: target,
        message: 'Installed resource shape changed; retained installation record',
      })
      expect(scan.records.map((item) => item.localId)).toEqual(
        expect.arrayContaining([record.localId, other.localId]),
      )
      expect(
        f.customize.getSnapshot().records.find((item) => item.localId === record.localId)
          ?.installedFiles,
      ).toEqual(record.installedFiles)
    }
    expect(await readFile(grouped ? target : join(target, 'a'), 'utf8')).toBe(
      grouped ? 'external packed' : 'external group',
    )
  },
)
test.each(['entry-to-directory', 'parent-to-file'] as const)(
  'scan isolates component %s changes without losing records or modifying files',
  async (shape) => {
    const f = await fixture()
    const input = await source(f.root, {
      'package.json': JSON.stringify(
        pkg('customize', {
          mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod', components: true }],
        }),
      ),
      'Mods/Core.SC2Mod/DocumentInfo': 'metadata',
      'Mods/Core.SC2Mod/Base.SC2Data/a': 'data',
    })
    const analysis = await f.service.analyze('customize', input)
    const record = await f.service.install({
      analysisId: analysis.analysisId,
      mode: 'scnexus',
      decisions: [],
    })
    const target = join(
      f.paths.modsRoot,
      'Core.SC2Mod',
      shape === 'entry-to-directory' ? 'DocumentInfo' : 'Base.SC2Data',
    )
    await rm(target, { recursive: true })
    if (shape === 'entry-to-directory') {
      await mkdir(target)
      await writeFile(join(target, 'user-content'), 'external edit')
    } else await writeFile(target, 'external edit')
    const otherInput = await source(f.root, {
      'package.json': JSON.stringify(
        pkg('customize', {
          name: 'Other',
          mods: [{ name: 'Other.SC2Mod', source_path: '/Mods/Other.SC2Mod' }],
        }),
      ),
      'Mods/Other.SC2Mod': 'valid',
    })
    const otherAnalysis = await f.service.analyze('customize', otherInput)
    const other = await f.service.install({
      analysisId: otherAnalysis.analysisId,
      mode: 'scnexus',
      decisions: [],
    })
    for (let i = 0; i < 2; i++) {
      const result = await f.service.scan()
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          message: 'Installed resource entry shape changed; retained installation record',
        }),
      )
      expect(result.records.map((item) => item.localId)).toEqual(
        expect.arrayContaining([record.localId, other.localId]),
      )
      expect(
        f.customize.getSnapshot().records.find((item) => item.localId === record.localId)
          ?.installedFiles,
      ).toEqual(record.installedFiles)
    }
    expect(
      await readFile(
        shape === 'entry-to-directory' ? join(target, 'user-content') : target,
        'utf8',
      ),
    ).toBe('external edit')
    expect(await readFile(join(f.paths.modsRoot, 'Other.SC2Mod'), 'utf8')).toBe('valid')
  },
)
test('scan synchronizes current customize file plans, counts, sizes and target tree', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('customize', {
        mods: [
          { name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod', components: true },
          { name: 'Other.SC2Mod', source_path: '/Mods/Other.SC2Mod' },
        ],
      }),
    ),
    'Mods/Core.SC2Mod/a': 'aaa',
    'Mods/Core.SC2Mod/b': 'bbbb',
    'Mods/Other.SC2Mod': 'other',
  })
  const analysis = await f.service.analyze('customize', input)
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  await rm(join(f.paths.modsRoot, 'Core.SC2Mod', 'a'))
  await rm(join(f.paths.modsRoot, 'Other.SC2Mod'))
  await writeFile(join(f.paths.modsRoot, 'Core.SC2Mod', 'b'), 'changed content')
  for (let i = 0; i < 2; i++) {
    await f.service.scan()
    const scanned = f.customize
      .getSnapshot()
      .records.find((item) => item.localId === record.localId)!
    expect(scanned.fileCount).toBe(1)
    expect(scanned.bytes).toBe(Buffer.byteLength('changed content'))
    expect(scanned.files.map((file) => file.target)).toEqual(['Mods/Core.SC2Mod/b'])
    expect(scanned.installedFiles).toHaveLength(1)
    expect(JSON.stringify(scanned.targetTree)).not.toContain('Other.SC2Mod')
    expect(scanned.targetTree.bytes).toBe(scanned.bytes)
  }
  await rm(join(f.paths.modsRoot, 'Core.SC2Mod', 'b'))
  await f.service.scan()
  const empty = f.customize.getSnapshot().records.find((item) => item.localId === record.localId)!
  expect(empty.fileCount).toBe(0)
  expect(empty.bytes).toBe(0)
  expect(empty.files).toEqual([])
  expect(empty.targetTree.children).toEqual([])
})
test.each(['modify', 'delete', 'shape'] as const)(
  'kept resource %s after preview does not prevent uninstalling metadata',
  async (change) => {
    const f = await fixture()
    await mkdir(f.paths.modsRoot, { recursive: true })
    const target = join(f.paths.modsRoot, 'Core.SC2Mod')
    await writeFile(target, 'local')
    const input = await source(f.root, {
      'package.json': JSON.stringify(
        pkg('customize', { mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod' }] }),
      ),
      'Mods/Core.SC2Mod': 'incoming',
    })
    const analysis = await f.service.analyze('customize', input)
    const record = await f.service.install({
      analysisId: analysis.analysisId,
      mode: 'scnexus',
      decisions: decisions(analysis, 'scnexus', 'keep'),
    })
    const removal = await f.service.prepareRemoval(record.localId, 'uninstall')
    if (change === 'modify') await writeFile(target, 'user edit')
    else {
      await rm(target)
      if (change === 'shape') {
        await mkdir(target)
        await writeFile(join(target, 'a'), 'user edit')
      }
    }
    await f.service.remove(removal.removalId, [])
    expect(f.customize.getSnapshot().records).toEqual([])
    const remainingContent = await readFile(
      change === 'shape' ? join(target, 'a') : target,
      'utf8',
    ).then(
      (content) => content,
      (error: NodeJS.ErrnoException) => error.code,
    )
    expect(remainingContent).toBe(change === 'delete' ? 'ENOENT' : 'user edit')
  },
)
test.each(['keep', 'delete'] as const)(
  'changed shared resource removal follows %s decision',
  async (action) => {
    const f = await fixture()
    const make = (name: string) =>
      source(f.root, {
        'package.json': JSON.stringify(
          pkg('customize', {
            name,
            mods: [{ name: 'Shared.SC2Mod', source_path: '/Mods/Shared.SC2Mod' }],
          }),
        ),
        'Mods/Shared.SC2Mod': name,
      })
    const first = await f.service.analyze('customize', await make('First'))
    const owner = await f.service.install({
      analysisId: first.analysisId,
      mode: 'scnexus',
      decisions: [],
    })
    const second = await f.service.analyze('customize', await make('Second'))
    await f.service.install({
      analysisId: second.analysisId,
      mode: 'scnexus',
      decisions: decisions(second, 'scnexus', 'keep'),
    })
    const removal = await f.service.prepareRemoval(owner.localId, 'uninstall')
    expect(removal.files).toHaveLength(1)
    const target = join(f.paths.modsRoot, 'Shared.SC2Mod')
    await writeFile(target, 'user edit')
    const run = f.service.remove(removal.removalId, [
      { conflictId: removal.files[0].conflictId, action },
    ])
    const result = await run.then(
      () => undefined,
      (error: unknown) => error,
    )
    const conflictError = expect.objectContaining({ code: 'M051' })
    expect(result).toEqual(action === 'delete' ? conflictError : undefined)
    expect(await readFile(target, 'utf8')).toBe('user edit')
  },
)
test('SCNexus campaign import defers all game resource conflicts until activation', async () => {
  const f = await fixture()
  const target = join(f.paths.mapsRoot, 'Campaign', 'M.SC2Map')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'old'), 'old map')
  await mkdir(f.paths.modsRoot, { recursive: true })
  await writeFile(join(f.paths.modsRoot, 'Core.SC2Mod'), 'old mod')
  const input = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('campaign', {
        mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod', components: true }],
      }),
    ),
    'Maps/Campaign/M.SC2Map/a': 'new map',
    'Maps/Campaign/M.SC2Map/b': 'new map part',
    'Mods/Core.SC2Mod/a': 'new mod',
    'Mods/Core.SC2Mod/b': 'new mod part',
  })
  const analysis = await f.service.analyze('campaign', input)
  expect(analysis.conflicts.find((group) => group.mode === 'scnexus')?.files).toEqual([])
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  expect(await readFile(join(target, 'old'), 'utf8')).toBe('old map')
  expect(await readFile(join(f.paths.modsRoot, 'Core.SC2Mod'), 'utf8')).toBe('old mod')
  const activation = await f.service.prepareActivation(record.localId)
  expect(activation.conflicts).toHaveLength(2)
  expect(activation.conflicts.map((conflict) => conflict.local.path).sort()).toEqual(
    [target, join(f.paths.modsRoot, 'Core.SC2Mod')].sort(),
  )
  expect(activation.conflicts.every((conflict) => !conflict.local.path.endsWith('/a'))).toBe(true)
})
test.each(['delete', 'keep'] as const)(
  'scanned CCM without activation ownership requires whole-resource %s decisions before removing markers',
  async (action) => {
    const f = await fixture()
    const directory = join(f.paths.ccmRoot, 'Discovered')
    const target = join(f.paths.mapsRoot, 'Campaign', 'M.SC2Map')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'metadata.txt'), 'title=Discovered\ncampaign=WOL')
    await writeFile(join(directory, 'M.SC2Map'), 'library map')
    await mkdir(join(target, 'Base.SC2Data'), { recursive: true })
    await writeFile(join(target, 'Base.SC2Data', 'a'), 'active component')
    await writeFile(
      join(f.paths.mapsRoot, 'Campaign', 'metadata.txt'),
      'title=Discovered\ncampaign=WOL',
    )
    const scan = await f.service.scan()
    const record = scan.records[0]
    expect(scan.active.WOL?.ownershipUnknown).toBe(true)
    const removal = await f.service.prepareRemoval(record.localId, 'deactivate')
    expect(removal.files).toHaveLength(1)
    expect(removal.files[0].file.target).toBe('Maps/Campaign/M.SC2Map')
    await expect(f.service.remove(removal.removalId, [])).rejects.toMatchObject({ code: 'M051' })
    expect(await readFile(join(f.paths.mapsRoot, 'Campaign', 'metadata.txt'), 'utf8')).toContain(
      'Discovered',
    )
    await f.service.remove(removal.removalId, [{ conflictId: removal.files[0].conflictId, action }])
    expect((await stat(target).catch(() => null)) !== null).toBe(action === 'keep')
    await expect(stat(join(f.paths.mapsRoot, 'Campaign', 'metadata.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    const uninstall = await f.service.prepareRemoval(record.localId, 'uninstall')
    await f.service.remove(uninstall.removalId, [])
    await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' })
  },
)
test('active campaign removal still requires deactivation and deletes newly installed whole map groups', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'metadata.txt': 'title=Managed\ncampaign=WOL',
    'M.SC2Map/a': 'part a',
    'M.SC2Map/b': 'part b',
  })
  const analysis = await f.service.analyze('campaign', input)
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'ccm',
    decisions: [],
  })
  const activation = await f.service.prepareActivation(record.localId)
  await f.service.activate(activation.activationId, [])
  await expect(f.service.prepareRemoval(record.localId, 'uninstall')).rejects.toMatchObject({
    code: 'M051',
  })
  const removal = await f.service.prepareRemoval(record.localId, 'deactivate')
  expect(removal.files).toEqual([])
  await f.service.remove(removal.removalId, [])
  await expect(stat(join(f.paths.mapsRoot, 'Campaign', 'M.SC2Map'))).rejects.toMatchObject({
    code: 'ENOENT',
  })
  const uninstall = await f.service.prepareRemoval(record.localId, 'uninstall')
  await f.service.remove(uninstall.removalId, [])
  await expect(stat(record.managementDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
})
test('incomplete active map records cannot remove only the campaign marker', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'metadata.txt': 'title=Incomplete\ncampaign=WOL',
    'M.SC2Map/a': 'map',
  })
  const analysis = await f.service.analyze('campaign', input)
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'ccm',
    decisions: [],
  })
  const preview = await f.service.prepareActivation(record.localId)
  const active = await f.service.activate(preview.activationId, [])
  f.active.update({ ...f.active.getSnapshot(), active: { WOL: { ...active, installedFiles: [] } } })
  await expect(f.service.prepareRemoval(record.localId, 'deactivate')).rejects.toMatchObject({
    code: 'M051',
  })
  expect(await readFile(join(f.paths.mapsRoot, 'Campaign', 'metadata.txt'), 'utf8')).toContain(
    'Incomplete',
  )
  expect(await readFile(join(f.paths.mapsRoot, 'Campaign', 'M.SC2Map', 'a'), 'utf8')).toBe('map')
})
test('cancelled preview cannot install or leave a successful record', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('customize', {
        maps: [{ name: 'A.SC2Map', source_path: '/Maps/A.SC2Map' }],
      }),
    ),
    'Maps/A.SC2Map': 'map',
  })
  const analysis = await f.service.analyze('customize', input)
  f.service.cancel(analysis.analysisId)
  await expect(
    f.service.install({
      analysisId: analysis.analysisId,
      mode: 'scnexus',
      decisions: [],
    }),
  ).rejects.toMatchObject({ code: 'M049' })
  expect(f.customize.getSnapshot().records).toEqual([])
})
test('CCM conversion persists a valid standard manifest for component mods', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'metadata.txt': 'title=C\ncampaign=WOL',
    'M.SC2Map': 'map',
    'Mods/Core.SC2Mod/a': 'component',
  })
  const analysis = await f.service.analyze('campaign', input)
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  expect(record.package.mods?.[0]).toMatchObject({
    source_path: '/Mods/Core.SC2Mod',
    components: true,
  })
  expect(await readFile(join(record.managementDirectory, 'metadata.txt'), 'utf8')).toBe(
    'title=C\ncampaign=WOL',
  )
  const preview = await f.service.prepareActivation(record.localId)
  await f.service.activate(preview.activationId, [])
  expect(await readFile(join(f.paths.modsRoot, 'Core.SC2Mod/a'), 'utf8')).toBe('component')
  const scanned = await f.service.scan()
  expect(scanned.active.WOL?.localId).toBe(record.localId)
})
test('deactivation asks only about non-official files referenced by installed works', async () => {
  const f = await fixture()
  const campaignInput = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('campaign', {
        mods: [{ name: 'Shared.SC2Mod', source_path: '/Mods/Shared.SC2Mod' }],
      }),
    ),
    'Maps/Campaign/M.SC2Map': 'campaign',
    'Mods/Shared.SC2Mod': 'mod',
  })
  const analysis = await f.service.analyze('campaign', campaignInput)
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  const activation = await f.service.prepareActivation(record.localId)
  await f.service.activate(activation.activationId, [])
  const work = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('customize', {
        maps: [{ name: 'M.SC2Map', source_path: '/Maps/Campaign/M.SC2Map' }],
        mods: [{ name: 'Shared.SC2Mod', source_path: '/Mods/Shared.SC2Mod' }],
      }),
    ),
    'Maps/Campaign/M.SC2Map': 'work',
    'Mods/Shared.SC2Mod': 'mod',
  })
  const workAnalysis = await f.service.analyze('customize', work)
  await f.service.install({
    analysisId: workAnalysis.analysisId,
    mode: 'scnexus',
    decisions: decisions(workAnalysis, 'scnexus', 'keep'),
  })
  const removal = await f.service.prepareRemoval(record.localId, 'deactivate')
  expect(removal.files.map((f) => f.file.target)).toEqual(['Mods/Shared.SC2Mod'])
  await expect(f.service.remove(removal.removalId, [])).rejects.toMatchObject({
    code: 'M051',
  })
  await f.service.remove(removal.removalId, [
    { conflictId: removal.files[0].conflictId, action: 'keep' },
  ])
  expect(await readFile(join(f.paths.modsRoot, 'Shared.SC2Mod'), 'utf8')).toBe('mod')
  await expect(stat(join(f.paths.mapsRoot, 'Campaign/M.SC2Map'))).rejects.toMatchObject({
    code: 'ENOENT',
  })
})
test('campaign preserves authored source/target remapping and same-root CCM original', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'Project/package.json': JSON.stringify(
      pkg('campaign', {
        mods: [
          {
            name: 'Original.SC2Mod',
            source_path: '/Mods/Original.SC2Mod',
            target_path: '/Mods/Installed.SC2Mod',
          },
        ],
      }),
    ),
    'Project/Maps/Campaign/M.SC2Map': 'map',
    'Project/Mods/Original.SC2Mod': 'mod',
    'Project/metadata.txt': 'title=CCM\ncampaign=WOL',
  })
  const analysis = await f.service.analyze('campaign', input)
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  expect(record.package.mods?.[0].source_path).toBe('/Mods/Original.SC2Mod')
  expect(await readFile(join(record.payloadDirectory!, 'Mods/Original.SC2Mod'), 'utf8')).toBe('mod')
  expect(await readFile(join(record.managementDirectory, 'metadata.txt'), 'utf8')).toBe(
    'title=CCM\ncampaign=WOL',
  )
  const activation = await f.service.prepareActivation(record.localId)
  await f.service.activate(activation.activationId, [])
  expect(await readFile(join(f.paths.modsRoot, 'Installed.SC2Mod'), 'utf8')).toBe('mod')
})
test('CCM installs under sanitized metadata title and rejects duplicate title without touching existing package', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'Wrapper/metadata.txt': 'title=  中文 战役?  \ncampaign=WOL',
    'Wrapper/M.SC2Map': 'original map',
  })
  const analysis = await f.service.analyze('campaign', input)
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'ccm',
    decisions: [],
  })
  expect(record.managementDirectory).toBe(join(f.paths.ccmRoot, '中文_战役'))
  expect(record.localId).not.toBe('中文_战役')
  const duplicate = await f.service.analyze('campaign', input)
  expect(duplicate.existingInstallations.ccm[0]).toMatchObject({
    localId: record.localId,
    directory: record.managementDirectory,
    matchedBy: ['title', 'directory'],
  })
  expect(duplicate.existingInstallations.auto).toEqual([])
  await expect(
    f.service.install({
      analysisId: duplicate.analysisId,
      mode: 'ccm',
      decisions: [],
    }),
  ).rejects.toMatchObject({ code: 'M051' })
  expect(await readFile(join(record.managementDirectory, 'M.SC2Map'), 'utf8')).toBe('original map')
  await f.service.scan()
  expect(f.campaign.getSnapshot().records[0].localId).toBe(record.localId)
  const activation = await f.service.prepareActivation(record.localId)
  await f.service.activate(activation.activationId, [])
  await f.service.scan()
  expect(f.active.getSnapshot().active.WOL?.localId).toBe(record.localId)
  const removal = await f.service.prepareRemoval(record.localId, 'deactivate')
  await f.service.remove(removal.removalId, [])
  const uninstall = await f.service.prepareRemoval(record.localId, 'uninstall')
  await f.service.remove(uninstall.removalId, [])
  await expect(stat(record.managementDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
})
test('SCNexus existing installations match either scnid or name within the same domain and game', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('customize', {
        name: 'Installed',
        scnid: 7,
        maps: [{ name: 'A.SC2Map', source_path: '/Maps/A.SC2Map' }],
      }),
    ),
    'Maps/A.SC2Map': 'map',
  })
  const analysis = await f.service.analyze('customize', input)
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  for (const fields of [
    { name: 'Renamed', scnid: 7 },
    { name: 'Installed', scnid: 8 },
    { name: 'Installed' },
  ]) {
    const candidate = await source(f.root, {
      'package.json': JSON.stringify(
        pkg('customize', {
          ...fields,
          maps: [{ name: 'A.SC2Map', source_path: '/Maps/A.SC2Map' }],
        }),
      ),
      'Maps/A.SC2Map': 'map',
    })
    const result = await f.service.analyze('customize', candidate)
    expect(result.existingInstallations.scnexus[0]).toMatchObject({
      localId: record.localId,
      directory: record.managementDirectory,
      package: { name: 'Installed' },
    })
    expect(result.existingInstallations.scnexus[0].record?.localId).toBe(record.localId)
  }
})
test('CCM existing directory is reported even without a stored record', async () => {
  const f = await fixture()
  const directory = join(f.paths.ccmRoot, 'Existing_Title')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'metadata.txt'), 'title=Existing Title\ncampaign=WOL')
  const input = await source(f.root, {
    'metadata.txt': 'title=Existing Title\ncampaign=WOL',
    'M.SC2Map': 'map',
  })
  const analysis = await f.service.analyze('campaign', input)
  expect(analysis.existingInstallations.ccm[0]).toMatchObject({
    localId: null,
    directory,
    package: { name: 'Existing Title' },
    record: null,
  })
})

test('damaged CCM metadata reports occupied directory without failing analysis', async () => {
  const f = await fixture()
  const directory = join(f.paths.ccmRoot, 'Damaged')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'metadata.txt'), 'broken')
  const input = await source(f.root, {
    'metadata.txt': 'title=Damaged\ncampaign=WOL',
    'M.SC2Map': 'map',
  })
  const result = await f.service.analyze('campaign', input)
  expect(result.existingInstallations.ccm[0]).toMatchObject({
    directory,
    package: null,
    matchedBy: ['directory'],
    diagnostic: { code: 'M034', message: '已存在同名内容，但信息无法解析' },
  })
})

test.each([
  ['maps', 'mods'],
  ['maps', 'Mods'],
  ['Maps', 'mods'],
])(
  'mapped resource roots %s/%s survive group conflicts, scan, restore and uninstall',
  async (maps, mods) => {
    const f = await fixture(maps, mods)
    const original = join(f.paths.mapsRoot, 'Campaign', 'Group.SC2Map', 'component')
    await mkdir(join(original, '..'), { recursive: true })
    await writeFile(original, 'original-map')
    await mkdir(f.paths.modsRoot, { recursive: true })
    await writeFile(join(f.paths.modsRoot, 'Core.SC2Mod'), 'original-mod')
    const input = await source(f.root, {
      'package.json': JSON.stringify(
        pkg('campaign', { mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod' }] }),
      ),
      'Maps/Campaign/Group.SC2Map/component': 'new-map',
      'Mods/Core.SC2Mod': 'new-mod',
    })
    const analysis = await f.service.analyze('campaign', input)
    const record = await f.service.install({
      analysisId: analysis.analysisId,
      mode: 'scnexus',
      decisions: [],
    })
    const activation = await f.service.prepareActivation(record.localId)
    expect(activation.conflicts).toHaveLength(2)
    await f.service.activate(
      activation.activationId,
      activation.conflicts.map((file) => ({
        conflictId: file.conflictId,
        action: 'overwrite' as const,
      })),
    )
    expect(await readFile(original, 'utf8')).toBe('new-map')
    const scanned = await f.service.scan()
    expect(scanned.diagnostics).toEqual([])
    expect(
      scanned.active.WOL?.installedFiles.every((file) =>
        file.absolutePath.startsWith(file.type === 'map' ? f.paths.mapsRoot : f.paths.modsRoot),
      ),
    ).toBe(true)
    const removal = await f.service.prepareRemoval(record.localId, 'deactivate')
    await f.service.remove(removal.removalId, [])
    expect(await readFile(original, 'utf8')).toBe('original-map')
    expect(await readFile(join(f.paths.modsRoot, 'Core.SC2Mod'), 'utf8')).toBe('original-mod')
    const uninstall = await f.service.prepareRemoval(record.localId, 'uninstall')
    await f.service.remove(uninstall.removalId, [])
    expect(f.campaign.getSnapshot().records).toHaveLength(0)
  },
)
test('lowercase maps root preserves nested CCM discovery, activation and uninstall paths', async () => {
  const f = await fixture('maps', 'mods')
  const directory = join(f.paths.ccmRoot, 'Nested', 'Package')
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'metadata.txt'),
    'title=CaseCCM\ndesc=test\nauthor=A\nversion=1\ncampaign=WOL',
  )
  await writeFile(join(directory, 'M.SC2Map'), 'map')
  const scanned = await f.service.scan()
  expect(scanned.diagnostics).toEqual([])
  const record = scanned.records[0]!
  expect(record.managementDirectory).toBe(directory)
  const activation = await f.service.prepareActivation(record.localId)
  await f.service.activate(activation.activationId, [])
  expect(await readFile(join(f.paths.mapsRoot, 'Campaign', 'M.SC2Map'), 'utf8')).toBe('map')
  expect((await f.service.scan()).active.WOL?.descriptorPath).toBe(
    join(f.paths.mapsRoot, 'Campaign', 'metadata.txt'),
  )
  const removal = await f.service.prepareRemoval(record.localId, 'deactivate')
  await f.service.remove(removal.removalId, [])
  const uninstall = await f.service.prepareRemoval(record.localId, 'uninstall')
  await f.service.remove(uninstall.removalId, [])
})

test('customize install and rebuilt records retain lowercase physical roots through uninstall', async () => {
  const f = await fixture('maps', 'mods')
  const input = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('customize', {
        maps: [{ name: 'Test.SC2Map', source_path: '/Maps/Test.SC2Map' }],
        mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod' }],
      }),
    ),
    'Maps/Test.SC2Map/component': 'map',
    'Mods/Core.SC2Mod/component': 'mod',
  })
  const result = await f.service.analyze('customize', input)
  const record = await f.service.install({
    analysisId: result.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  expect(record.installedFiles.map((file) => file.absolutePath)).toContain(
    join(f.paths.mapsRoot, 'Test.SC2Map', 'component'),
  )
  expect((await f.service.scan()).diagnostics).toEqual([])
  const removal = await f.service.prepareRemoval(record.localId, 'uninstall')
  await f.service.remove(removal.removalId, [])
  await expect(stat(join(f.paths.mapsRoot, 'Test.SC2Map'))).rejects.toMatchObject({
    code: 'ENOENT',
  })
  await expect(stat(join(f.paths.modsRoot, 'Core.SC2Mod'))).rejects.toMatchObject({
    code: 'ENOENT',
  })
})

test('customize launcher selection is validated, persisted and retained by scan including explicit null', async () => {
  const f = await fixture('maps', 'mods')
  const input = await source(f.root, {
    'package.json': JSON.stringify(
      pkg('customize', {
        maps: [
          {
            name: 'start.SC2Map',
            source_path: '/Maps/launcher.SC2Map',
            target_path: '/Maps/Start.SC2Map',
          },
          { name: 'level.SC2Map', source_path: '/Maps/Group.SC2Map' },
        ],
      }),
    ),
    'Maps/launcher.SC2Map': 'start',
    'Maps/Group.SC2Map/MapInfo': 'component',
    'Maps/Group.SC2Map/Triggers': 'triggers',
  })
  const analysis = await f.service.analyze('customize', input)
  expect(analysis.modes.scnexus!.launcher).toEqual({
    source: 'detected',
    target: 'Maps/Start.SC2Map',
    candidates: [
      { name: 'Start.SC2Map', target: 'Maps/Start.SC2Map' },
      { name: 'Group.SC2Map', target: 'Maps/Group.SC2Map' },
    ],
  })
  const selection = { analysisId: analysis.analysisId, mode: 'scnexus', decisions: [] }
  await expect(
    f.service.install({ ...selection, launcherTarget: '../escape.SC2Map' }),
  ).rejects.toMatchObject({ name: 'IPC-INVALID-ARGUMENT' })
  const record = await f.service.install({ ...selection, launcherTarget: null })
  expect(record.launcherTarget).toBeNull()
  expect(() => validateCustomizeRecord(record)).not.toThrow()
  for (const launcherTarget of [
    123,
    '../outside.SC2Map',
    'Maps/../outside.SC2Map',
    'Mods/Core.SC2Mod',
    'Maps\\Start.SC2Map',
    'Maps/Start.SC2Map/MapInfo',
  ]) {
    expect(() => validateCustomizeRecord({ ...record, launcherTarget })).toThrow(/./)
  }
  expect(
    JSON.parse(await readFile(join(record.managementDirectory, 'install-manifest.json'), 'utf8'))
      .launcherTarget,
  ).toBeNull()
  expect((await f.service.scan()).records[0]!.launcherTarget).toBeNull()
  const manifest = JSON.parse(
    await readFile(join(record.managementDirectory, 'install-manifest.json'), 'utf8'),
  )
  delete manifest.launcherTarget
  await writeFile(
    join(record.managementDirectory, 'install-manifest.json'),
    JSON.stringify(manifest),
  )
  const rebuilt = await scanContent(f.paths)
  expect(rebuilt.records[0]!.launcherTarget).toBe('Maps/Start.SC2Map')
})

test('manifest launcher overrides detected names, rejects duplicate declarations and cannot be replaced', async () => {
  const f = await fixture()
  const data = pkg('customize', {
    launcher: { name: 'entry.SC2Map' },
    maps: [
      {
        name: 'entry.SC2Map',
        source_path: '/Maps/Other.SC2Map',
        target_path: '/Maps/Renamed.SC2Map',
      },
      { name: 'fallback.SC2Map', source_path: '/Maps/launcher.SC2Map' },
    ],
  })
  expect(() =>
    parsePackage(JSON.stringify({ ...data, maps: [...data.maps!, data.maps![0]] })),
  ).toThrow(/./)
  const input = await source(f.root, {
    'package.json': JSON.stringify(data),
    'Maps/Other.SC2Map/MapInfo': 'group',
    'Maps/launcher.SC2Map': 'fallback',
  })
  const analysis = await f.service.analyze('customize', input)
  expect(analysis.modes.scnexus!.launcher).toMatchObject({
    source: 'manifest',
    target: 'Maps/Renamed.SC2Map',
  })
  const selection = { analysisId: analysis.analysisId, mode: 'scnexus', decisions: [] }
  await expect(f.service.install({ ...selection, launcherTarget: null })).rejects.toMatchObject({
    name: 'IPC-INVALID-ARGUMENT',
  })
  const record = await f.service.install(selection)
  expect(record.launcherTarget).toBe('Maps/Renamed.SC2Map')
  expect((await f.service.scan()).records[0]!.launcherTarget).toBe('Maps/Renamed.SC2Map')
})

test('ambiguous detected launchers require selection and any logical map root can be selected', async () => {
  const f = await fixture()
  const input = await source(f.root, {
    'Maps/launcher.SC2Map': 'one',
    'Maps/启动器.SC2Map/MapInfo': 'two',
    'Maps/Mission.SC2Map': 'three',
  })
  const analysis = await f.service.analyze('customize', input)
  expect(analysis.modes.auto!.launcher).toMatchObject({ source: 'detected', target: null })
  expect(analysis.modes.auto!.launcher.candidates).toHaveLength(3)
  const installed = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'auto',
    decisions: [],
    launcherTarget: 'Maps/Mission.SC2Map',
  })
  expect(installed.launcherTarget).toBe('Maps/Mission.SC2Map')
  expect((await f.service.scan()).records[0]!.launcherTarget).toBe('Maps/Mission.SC2Map')
})

test('scan normalizes only installed legacy package spellings without rewriting author or management files', async () => {
  const f = await fixture()
  const data = pkg('customize', {
    bank_enable: 'official',
    launcher: { name: 'Entry.SC2Map' },
    maps: [{ name: 'Entry.SC2Map', source_path: '/Maps/Entry.SC2Map' }],
  })
  const input = await source(f.root, {
    'package.json': JSON.stringify(data),
    'Maps/Entry.SC2Map': 'entry',
  })
  const analysis = await f.service.analyze('customize', input)
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  const legacyPackage = { ...data, bank_enable: 'offcial', luancher: data.launcher } as Record<
    string,
    unknown
  >
  delete legacyPackage.launcher
  const packageRaw = JSON.stringify(legacyPackage)
  const manifest = { ...record, package: legacyPackage }
  delete manifest.launcherTarget
  delete manifest.launcherCustomized
  const manifestRaw = JSON.stringify(manifest)
  const packagePath = join(record.managementDirectory, 'package.json')
  const manifestPath = join(record.managementDirectory, 'install-manifest.json')
  await writeFile(packagePath, packageRaw)
  await writeFile(manifestPath, manifestRaw)
  const scanned = await scanContent(f.paths)
  expect(scanned.diagnostics).toEqual([])
  expect(scanned.records).toHaveLength(1)
  expect(scanned.records[0]!.package).toEqual(data)
  expect(scanned.records[0]!.launcherTarget).toBe('Maps/Entry.SC2Map')
  expect(await readFile(packagePath, 'utf8')).toBe(packageRaw)
  expect(await readFile(manifestPath, 'utf8')).toBe(manifestRaw)
  expect(await readFile(join(input.path, 'package.json'), 'utf8')).toBe(JSON.stringify(data))
  expect(() => parsePackage(packageRaw)).toThrow(
    expect.objectContaining({ name: 'ARCHIVE-METADATA-INVALID' }),
  )
  const launcherOnly = { ...legacyPackage, bank_enable: 'official' }
  expect(parsePackage(JSON.stringify(launcherOnly)).launcher).toBeUndefined()
  await writeFile(
    packagePath,
    JSON.stringify({ ...legacyPackage, launcher: { name: 'Other.SC2Map' } }),
  )
  const conflicted = await scanContent(f.paths)
  expect(conflicted.records).toHaveLength(0)
  expect(conflicted.diagnostics.length).toBeGreaterThan(0)
})
