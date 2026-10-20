import { test, expect, afterEach, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { ContentService, validateRecordPaths, validateActiveResources } from '../content-package'
import { scanContent } from '../scanner'
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
async function fixture() {
  const root = await mkdtemp(join(process.cwd(), '.scnexus-content-'))
  roots.push(root)
  const game = join(root, 'game')
  await mkdir(game)
  await writeFile(join(game, 'StarCraft II.exe'), 'stub')
  const paths = gamePaths(game, join(root, 'documents'))
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
  await expect(stat(join(f.paths.modsRoot, 'Core.SC2Mod'))).rejects.toThrow()
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
  await expect(stat(join(f.paths.gameRoot, 'Maps/Campaign/void/package.json'))).rejects.toThrow()
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
  await expect(stat(join(f.paths.gameRoot, 'Maps/Campaign/swarm/M.SC2Map'))).rejects.toThrow()
  const preview = await f.service.prepareActivation(record.localId)
  await f.service.activate(preview.activationId, [])
  expect(
    await readFile(join(f.paths.gameRoot, 'Maps/Campaign/swarm/metadata.txt'), 'utf8'),
  ).toContain('title=C')
  await expect(stat(join(record.managementDirectory, 'package.json'))).rejects.toThrow()
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
    if (shape === 'directory-to-file') expect(await readFile(target, 'utf8')).toBe('custom archive')
    else {
      expect(await readFile(join(target, 'DocumentInfo'), 'utf8')).toBe('custom info')
      expect((await stat(join(target, 'IncomingEmpty'))).isDirectory()).toBe(true)
      await expect(stat(join(target, 'old-only'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
    const scanned = await f.service.scan()
    expect(scanned.active.WOL?.resourceBackups).toHaveLength(1)
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
      await expect(failing.remove(removal.removalId, [])).rejects.toThrow('restore state failed')
      expect(await readFile(join(target, 'DocumentInfo'), 'utf8')).toBe('custom info')
      expect(await readFile(scanned.active.WOL!.resourceBackups![0]!.path, 'utf8')).toBe(
        'official archive',
      )
    }
    const removal = await f.service.prepareRemoval(installed.localId, 'deactivate')
    await f.service.remove(removal.removalId, [])
    if (shape === 'file-to-directory')
      expect(await readFile(target, 'utf8')).toBe('official archive')
    else {
      expect(await readFile(join(target, 'old-only'), 'utf8')).toBe('official component')
      expect((await stat(join(target, 'Empty'))).isDirectory()).toBe(true)
      await expect(stat(join(target, 'DocumentInfo'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
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
    if (action === 'keep') {
      if (shape === 'file') expect(await readFile(target, 'utf8')).toBe('old archive')
      else expect(await readFile(join(target, 'old-only'), 'utf8')).toBe('old group')
      expect(installed.installedFiles.every((file) => file.result === 'kept')).toBe(true)
    } else if (component) expect(await readFile(join(target, 'new'), 'utf8')).toBe('new group')
    else expect(await readFile(target, 'utf8')).toBe('new archive')
    const removal = await f.service.prepareRemoval(installed.localId, 'uninstall')
    await f.service.remove(removal.removalId, [])
    if (action === 'keep') expect(await stat(target)).toBeDefined()
    else await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
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
    if (mode === 'ccm') {
      const scanned = await f.service.scan()
      expect(scanned.active.WOL?.installedFiles[0].target).toBe('Maps/Campaign/M.SC2Map')
      expect(scanned.active.WOL?.resourceBackups).toBeUndefined()
      const removal = await f.service.prepareRemoval(record.localId, 'deactivate')
      await f.service.remove(removal.removalId, [])
      expect(await readFile(backup, 'utf8')).toBe('untrusted replacement')
    } else {
      const scanned = await scanContent(f.paths, f.campaign.getSnapshot().records)
      expect(scanned.active.WOL).toBeUndefined()
      expect(scanned.diagnostics.length).toBeGreaterThan(0)
      f.active.update({ ...f.active.getSnapshot(), active: { WOL: forged } } as never)
      await expect(f.service.prepareRemoval(record.localId, 'deactivate')).rejects.toMatchObject({
        code: 'M031',
      })
    }
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
  await expect(stat(join(f.paths.mapsRoot, 'Campaign/M.SC2Map'))).rejects.toThrow()
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
  await expect(stat(record.managementDirectory)).rejects.toThrow()
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
