import { test, expect, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ContentService } from '../content-package'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import type { ContentStore, CampaignActiveStoreData } from '@scnexus/app-shared/types/content.type'
import { createElectronBackend } from '../../../stores/store-electron-backend'
import { createCampaignRepository } from '../../../stores/campaign'
import { createCustomizeRepository } from '../../../stores/customize'
import { createActiveRepository } from '../../../stores/campaign-active'
import { createHash } from 'node:crypto'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
const dirs: string[] = []
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'scnexus-rollback-'))
  dirs.push(root)
  const paths = gamePaths(root, join(root, 'documents'))
  const storage = join(root, 'storage')
  await mkdir(storage)
  const campaign = createCampaignRepository(),
    customize = createCustomizeRepository(),
    active = createActiveRepository()
  campaign.init(await createElectronBackend('campaign', storage))
  customize.init(await createElectronBackend('customize', storage))
  active.init(await createElectronBackend('active', storage))
  return { root, paths, campaign, customize, active }
}
async function makeSource(root: string, files: Record<string, string>) {
  const path = join(root, 'input')
  await mkdir(path)
  for (const [name, data] of Object.entries(files)) {
    await mkdir(join(path, name, '..'), { recursive: true })
    await writeFile(join(path, name), data)
  }
  return { kind: 'directory' as const, path }
}
const packageText = JSON.stringify({
  name: 'Project',
  description: 'desc',
  version: '1',
  author: 'a',
  type: 'customize',
  maps: [{ name: 'A.SC2Map', source_path: '/Maps/A.SC2Map' }],
  mods: [{ name: 'M.SC2Mod', source_path: '/Mods/M.SC2Mod' }],
})
test('store-write failure restores overwritten files and removes partially-created files', async () => {
  const f = await setup()
  await mkdir(f.paths.modsRoot)
  await writeFile(join(f.paths.modsRoot, 'M.SC2Mod'), 'original')
  const service = new ContentService(
    async () => f.paths,
    f.campaign,
    {
      getSnapshot: f.customize.getSnapshot,
      update() {
        throw Error('disk write failed')
      },
    },
    f.active,
    async (run) => run(),
  )
  const input = await makeSource(f.root, {
    'package.json': packageText,
    'Maps/A.SC2Map': 'map',
    'Mods/M.SC2Mod': 'new',
  })
  const result = await service.analyze('customize', input)
  const decisions = result.conflicts[0].files.map((file) => ({
    conflictId: file.conflictId,
    action: 'overwrite' as const,
  }))
  await expect(
    service.install({
      analysisId: result.analysisId,
      mode: 'scnexus',
      decisions,
    }),
  ).rejects.toThrow('disk write failed')
  expect(await readFile(join(f.paths.modsRoot, 'M.SC2Mod'), 'utf8')).toBe('original')
  await expect(stat(join(f.paths.mapsRoot, 'A.SC2Map'))).rejects.toThrow()
  expect(f.customize.getSnapshot().records).toEqual([])
  expect((await readdir(f.root)).filter((x) => x.startsWith('.scnexus-operation'))).toEqual([])
})
test('uninstall store-write failure restores management directory and installed resources', async () => {
  const f = await setup()
  const service = new ContentService(
    async () => f.paths,
    f.campaign,
    f.customize,
    f.active,
    async (run) => run(),
  )
  const input = await makeSource(f.root, {
    'package.json': packageText,
    'Maps/A.SC2Map': 'map',
    'Mods/M.SC2Mod': 'mod',
  })
  const result = await service.analyze('customize', input)
  const installed = await service.install({
    analysisId: result.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  const failing = new ContentService(
    async () => f.paths,
    f.campaign,
    {
      getSnapshot: f.customize.getSnapshot,
      update() {
        throw Error('disk write failed')
      },
    },
    f.active,
    async (run) => run(),
  )
  const removal = await failing.prepareRemoval(installed.localId, 'uninstall')
  await expect(failing.remove(removal.removalId, [])).rejects.toThrow()
  expect(await readFile(installed.descriptorPath, 'utf8')).toContain('Project')
  expect(await readFile(join(f.paths.mapsRoot, 'A.SC2Map'), 'utf8')).toBe('map')
})
test('changed targets require a new preview and unresolved/mismatched decisions reject writes', async () => {
  const f = await setup()
  await mkdir(f.paths.modsRoot)
  await writeFile(join(f.paths.modsRoot, 'M.SC2Mod'), 'old')
  const service = new ContentService(
    async () => f.paths,
    f.campaign,
    f.customize,
    f.active,
    async (run) => run(),
  )
  const input = await makeSource(f.root, {
    'package.json': packageText,
    'Maps/A.SC2Map': 'map',
    'Mods/M.SC2Mod': 'new',
  })
  const result = await service.analyze('customize', input)
  await expect(
    service.install({
      analysisId: result.analysisId,
      mode: 'scnexus',
      decisions: [],
    }),
  ).rejects.toMatchObject({ code: 'M051' })
  await expect(
    service.install({ analysisId: result.analysisId, mode: 'scnexus', decisions: [] }, 'campaign'),
  ).rejects.toMatchObject({ code: 'M037' })
  await writeFile(join(f.paths.modsRoot, 'M.SC2Mod'), 'external change')
  await expect(
    service.install({
      analysisId: result.analysisId,
      mode: 'scnexus',
      decisions: result.conflicts[0].files.map((file) => ({
        conflictId: file.conflictId,
        action: 'overwrite',
      })),
    }),
  ).rejects.toMatchObject({ code: 'M051' })
  expect(await readFile(join(f.paths.modsRoot, 'M.SC2Mod'), 'utf8')).toBe('external change')
})
test('7z input uses real bundled archive tools without extraction to live game', async () => {
  const f = await setup()
  const input = await makeSource(f.root, {
    'package.json': packageText,
    'Maps/A.SC2Map': 'map',
    'Mods/M.SC2Mod': 'mod',
  })
  const { sevenZip } = await import('../../../utils/7zip-wrapper')
  const archive = join(f.root, 'work.7z')
  await sevenZip.add(archive, ['.'], { cwd: input.path, archiveType: '7z' })
  const service = new ContentService(
    async () => f.paths,
    f.campaign,
    f.customize,
    f.active,
    async (run) => run(),
  )
  const archiveSource = await (
    await import('../source')
  ).openSource({ kind: 'archive', path: archive })
  expect((await archiveSource.read('package.json')).toString()).toBe(packageText)
  const result = await service.analyze('customize', {
    kind: 'archive',
    path: archive,
  })
  expect(result.diagnostics).toEqual([])
  expect(result.modes.scnexus?.fileCount).toBe(2)
  await service.install({
    analysisId: result.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  expect(await readFile(join(f.paths.modsRoot, 'M.SC2Mod'), 'utf8')).toBe('mod')
})
test('legacy content index versions preserve records as untrusted migration history', async () => {
  const f = await setup()
  const storage = join(f.root, 'old')
  await mkdir(storage)
  await writeFile(
    join(storage, 'legacy.json'),
    JSON.stringify({
      _schemaVersion: 1,
      _revision: 7,
      ININTIALIZED: true,
      LAST_REFRESH_TIME: 1,
      CAMPAIGN_LIST_SET: { WOL: [{ name: 'Legacy', snid: 3 }] },
    }),
  )
  const repository = createCampaignRepository()
  repository.init(await createElectronBackend('legacy', storage))
  expect(repository.getSnapshot()._schemaVersion).toBe(2)
  expect(repository.getSnapshot().legacyRecords).toEqual([{ name: 'Legacy', snid: 3 }])
  expect((await readdir(storage)).some((name) => name.endsWith('.bak'))).toBe(true)
})
test('scanner reconstructs cleared stores from management manifests and ignores CCM source copies', async () => {
  const f = await setup()
  const service = new ContentService(
    async () => f.paths,
    f.campaign,
    f.customize,
    f.active,
    async (run) => run(),
  )
  const input = await makeSource(f.root, {
    'package.json': packageText,
    'Maps/A.SC2Map': 'map',
    'Mods/M.SC2Mod': 'mod',
  })
  const result = await service.analyze('customize', input)
  const record = await service.install({
    analysisId: result.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  await writeFile(join(record.managementDirectory, 'metadata.txt'), 'title=copy\ncampaign=WOL')
  f.customize.update({ ...f.customize.getSnapshot(), records: [] })
  await service.scan()
  expect(f.customize.getSnapshot().records[0].localId).toBe(record.localId)
  expect(f.campaign.getSnapshot().records).toEqual([])
})
test('scanner discovers external customize descriptors with game-relative target paths', async () => {
  const f = await setup()
  await mkdir(join(f.paths.mapsRoot, 'External'), { recursive: true })
  await mkdir(f.paths.modsRoot, { recursive: true })
  await writeFile(join(f.paths.modsRoot, 'M.SC2Mod'), 'mod')
  await writeFile(join(f.paths.mapsRoot, 'A.SC2Map'), 'map')
  await writeFile(join(f.paths.mapsRoot, 'External/package.json'), packageText)
  const service = new ContentService(
    async () => f.paths,
    f.campaign,
    f.customize,
    f.active,
    async (run) => run(),
  )
  await service.scan()
  const record = f.customize.getSnapshot().records[0]
  expect(record.external).toBe(true)
  const remove = await service.prepareRemoval(record.localId, 'uninstall')
  await service.remove(remove.removalId, [])
  await expect(stat(join(f.paths.mapsRoot, 'A.SC2Map'))).rejects.toThrow()
  expect((await readdir(f.paths.mapsRoot)).includes('External')).toBe(true)
})
test('corrupt management manifests are isolated without erasing existing records', async () => {
  const f = await setup()
  const service = new ContentService(
    async () => f.paths,
    f.campaign,
    f.customize,
    f.active,
    async (run) => run(),
  )
  const input = await makeSource(f.root, {
    'package.json': packageText,
    'Maps/A.SC2Map': 'map',
    'Mods/M.SC2Mod': 'mod',
  })
  const analysis = await service.analyze('customize', input)
  const record = await service.install({
    analysisId: analysis.analysisId,
    mode: 'scnexus',
    decisions: [],
  })
  await writeFile(join(record.managementDirectory, 'package.json'), 'broken')
  const scanned = await service.scan()
  expect(scanned.diagnostics).toHaveLength(1)
  expect(f.customize.getSnapshot().records[0].localId).toBe(record.localId)
})
test('official map resource files are isolated from components descriptors during source discovery', async () => {
  const f = await setup()
  const service = new ContentService(
    async () => f.paths,
    f.campaign,
    f.customize,
    f.active,
    async (run) => run(),
  )
  const input = await makeSource(f.root, {
    'Mods/Core.SC2Mod/package.json': packageText,
    'Mods/Core.SC2Mod/a': 'component',
  })
  const analysis = await service.analyze('customize', input)
  expect(analysis.modes.scnexus).toBeNull()
  expect(analysis.modes.auto).toBeNull()
})
