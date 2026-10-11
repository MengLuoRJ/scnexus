import { test, expect, afterEach, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ContentService } from '../content-package'
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
test('components report conflicts for each physical file and mixed choices', async () => {
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
  expect(files).toHaveLength(2)
  await f.service.install({
    analysisId: result.analysisId,
    mode: 'scnexus',
    decisions: files.map((f, i) => ({
      conflictId: f.conflictId,
      action: i === 0 ? 'keep' : 'overwrite',
    })),
  })
  expect(await readFile(join(f.paths.modsRoot, 'Core.SC2Mod/a'), 'utf8')).toBe('old a')
  expect(await readFile(join(f.paths.modsRoot, 'Core.SC2Mod/b'), 'utf8')).toBe('b')
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
