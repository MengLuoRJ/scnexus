import { afterEach, expect, test, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  CampaignActiveStoreData,
  ContentStore,
  ContentType,
} from '@scnexus/app-shared/types/content.type'
import { ContentService } from '../content-package'
import { parsePackage } from '../parser'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import { createDependencyRepository } from '../../../stores/dependency'

vi.mock('electron', () => ({ app: {} }))
const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
function index<T extends { _revision: number }>(initial: T) {
  let data = initial
  return {
    getSnapshot: () => structuredClone(data),
    update: (next: T) => {
      data = structuredClone({ ...next, _revision: data._revision + 1 })
      return structuredClone(data)
    },
  }
}
async function fixture(mapped = false) {
  const root = join(process.cwd(), '.dependency-test-' + randomUUID())
  roots.push(root)
  const game = join(root, 'game')
  await mkdir(game, { recursive: true })
  const paths = gamePaths(game, join(root, 'documents'))
  if (mapped) paths.modsRoot = join(game, 'mods')
  const initial: ContentStore = {
    _schemaVersion: 2,
    _revision: 0,
    records: [],
    legacyRecords: [],
    scannedAt: null,
  }
  const campaign = index(initial),
    customize = index(initial)
  const dependency = createDependencyRepository()
  dependency.init({ open: (options) => ({ store: options.defaults() }) })
  const service = new ContentService(
    async () => paths,
    campaign,
    customize,
    index<CampaignActiveStoreData>({
      _schemaVersion: 2,
      _revision: 0,
      active: {},
      legacyRecords: [],
      scannedAt: null,
    }),
    async (run) => run(),
    dependency,
  )
  const source = async (name: string, type: ContentType = 'dependency', component = true) => {
    const path = join(root, name)
    await mkdir(join(path, 'Mods', ...(component ? ['Shared.SC2Mod'] : [])), { recursive: true })
    await writeFile(join(path, 'Mods', 'Shared.SC2Mod', ...(component ? ['new.txt'] : [])), name)
    await writeFile(
      join(path, 'package.json'),
      JSON.stringify({
        type,
        name,
        description: '',
        author: 'Test',
        version: '1',
        mods: [{ name: 'Shared.SC2Mod', source_path: '/Mods/Shared.SC2Mod' }],
      }),
    )
    return { kind: 'directory' as const, path }
  }
  return { root, paths, source, service, dependency, customize, campaign }
}
async function install(
  f: Awaited<ReturnType<typeof fixture>>,
  name: string,
  type: ContentType = 'dependency',
  action: 'overwrite' | 'keep' = 'overwrite',
  component = true,
) {
  const analysis = await f.service.analyzeContent(await f.source(name, type, component))
  expect(analysis.contentType).toBe(type)
  return f.service.install(
    {
      analysisId: analysis.analysisId,
      mode: 'scnexus',
      decisions: analysis.conflicts
        .find((item) => item.mode === 'scnexus')!
        .files.map((file) => ({ conflictId: file.conflictId, action })),
    },
    type,
  )
}

test('dependency is explicit, mods-only, SCNexus-only, separately persisted and scan-recoverable', async () => {
  const f = await fixture(true)
  const source = await f.source('Library')
  const analysis = await f.service.analyzeContent(source)
  expect(analysis.contentType).toBe('dependency')
  expect(analysis.modes.ccm).toBeNull()
  expect(analysis.modes.auto).toBeNull()
  expect(analysis.recommendedMode).toBe('scnexus')
  const record = await f.service.install(
    { analysisId: analysis.analysisId, mode: 'scnexus', decisions: [] },
    'dependency',
  )
  expect(record.payloadDirectory).toBeNull()
  expect(record.installedFiles[0]!.absolutePath).toBe(
    join(f.paths.modsRoot, 'Shared.SC2Mod', 'new.txt'),
  )
  expect(f.dependency.getSnapshot().records).toHaveLength(1)
  expect(f.customize.getSnapshot().records).toEqual([])
  f.dependency.update({ ...f.dependency.getSnapshot(), records: [] })
  await f.service.scan()
  expect(f.dependency.getSnapshot().records[0]!.localId).toBe(record.localId)
  const removal = await f.service.prepareRemoval(record.localId, 'uninstall', 'dependency')
  expect(removal.files).toEqual([])
  await f.service.remove(removal.removalId, [], 'dependency')
  await expect(readFile(record.installedFiles[0]!.absolutePath)).rejects.toMatchObject({
    code: 'ENOENT',
  })
})

test('dependency conflicts replace whole resource groups and keep does not acquire deletion ownership', async () => {
  const f = await fixture()
  const original = await install(f, 'Original', 'customize')
  await writeFile(join(f.paths.modsRoot, 'Shared.SC2Mod', 'stale.txt'), 'old')
  const kept = await install(f, 'Kept', 'dependency', 'keep')
  expect(kept.installedFiles.every((file) => file.result === 'kept')).toBe(true)
  const removal = await f.service.prepareRemoval(kept.localId, 'uninstall', 'dependency')
  await f.service.remove(removal.removalId, [], 'dependency')
  expect(await readFile(original.installedFiles[0]!.absolutePath, 'utf8')).toBe('Original')
  await install(f, 'Replacement')
  await expect(
    readFile(join(f.paths.modsRoot, 'Shared.SC2Mod', 'stale.txt')),
  ).rejects.toMatchObject({ code: 'ENOENT' })
})

test('dependency uninstall asks about other works and keep preserves their resources and records', async () => {
  const f = await fixture()
  const dependency = await install(f, 'Library')
  const customize = await install(f, 'OtherWork', 'customize')
  const removal = await f.service.prepareRemoval(dependency.localId, 'uninstall', 'dependency')
  expect(removal.files[0]!.usedBy).toContainEqual({
    localId: customize.localId,
    name: 'OtherWork',
    type: 'customize',
  })
  await expect(f.service.remove(removal.removalId, [], 'dependency')).rejects.toMatchObject({
    code: 'M051',
  })
  await f.service.remove(
    removal.removalId,
    removal.files.map((file) => ({ conflictId: file.conflictId, action: 'keep' })),
    'dependency',
  )
  expect(await readFile(customize.installedFiles[0]!.absolutePath, 'utf8')).toBe('OtherWork')
  expect(f.customize.getSnapshot().records).toHaveLength(1)
  expect(f.dependency.getSnapshot().records).toEqual([])
})

test('dependency persistence failure rolls whole directory replacement back without deleting another work', async () => {
  const f = await fixture()
  const other = await install(f, 'Original', 'customize')
  await writeFile(join(f.paths.modsRoot, 'Shared.SC2Mod', 'old.txt'), 'untouched')
  vi.spyOn(f.dependency, 'update').mockImplementation(() => {
    throw new Error('Injected persistence failure')
  })
  await expect(install(f, 'Failed')).rejects.toThrow('Injected persistence failure')
  expect(await readFile(other.installedFiles[0]!.absolutePath, 'utf8')).toBe('Original')
  expect(await readFile(join(f.paths.modsRoot, 'Shared.SC2Mod', 'old.txt'), 'utf8')).toBe(
    'untouched',
  )
  expect(f.dependency.getSnapshot().records).toEqual([])
})

test('dependency file-to-directory replacement rolls back and mapped mod symlinks are rejected', async () => {
  const f = await fixture(true)
  await install(f, 'Original', 'customize', 'overwrite', false)
  vi.spyOn(f.dependency, 'update').mockImplementation(() => {
    throw new Error('rollback')
  })
  await expect(install(f, 'Failed')).rejects.toThrow('rollback')
  expect(await readFile(join(f.paths.modsRoot, 'Shared.SC2Mod'), 'utf8')).toBe('Original')
  await rm(join(f.paths.modsRoot, 'Shared.SC2Mod'))
  const outside = join(f.root, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'new.txt'), 'private')
  await symlink(
    outside,
    join(f.paths.modsRoot, 'Shared.SC2Mod'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  await expect(f.service.analyzeContent(await f.source('Linked'))).rejects.toMatchObject({
    code: 'M031',
  })
  expect(await readFile(join(outside, 'new.txt'), 'utf8')).toBe('private')
})

test.each([{ maps: [] }, { manager: 'CCM' }, { campaign: 'WOL' }, { dependencies: [] }])(
  'dependency rejects content-only metadata %j',
  (extra) => {
    expect(() =>
      parsePackage(
        JSON.stringify({
          type: 'dependency',
          name: 'Invalid',
          description: '',
          author: '',
          version: '',
          ...extra,
        }),
      ),
    ).toThrow(Error)
  },
)

test('customize uninstall sees dependency ownership and keeps the dependency resources', async () => {
  const f = await fixture()
  const customize = await install(f, 'OtherWork', 'customize')
  const dependency = await install(f, 'Library')
  const removal = await f.service.prepareRemoval(customize.localId, 'uninstall', 'customize')
  expect(removal.files[0]!.usedBy).toContainEqual({
    localId: dependency.localId,
    name: 'Library',
    type: 'dependency',
  })
  await f.service.remove(
    removal.removalId,
    removal.files.map((file) => ({ conflictId: file.conflictId, action: 'keep' })),
    'customize',
  )
  expect(await readFile(dependency.installedFiles[0]!.absolutePath, 'utf8')).toBe('Library')
  expect(f.dependency.getSnapshot().records).toHaveLength(1)
})

test('dependency uninstall protects recorded CCM campaign mods and rollback restores resources', async () => {
  const f = await fixture()
  const dependency = await install(f, 'Library')
  const campaign = {
    ...dependency,
    localId: 'campaign-owner',
    mode: 'ccm' as const,
    package: {
      name: 'Campaign',
      type: 'campaign' as const,
      campaign: 'WOL' as const,
      description: '',
      version: '1',
      author: 'Test',
    },
  }
  f.campaign.update({ ...f.campaign.getSnapshot(), records: [campaign] })
  const removal = await f.service.prepareRemoval(dependency.localId, 'uninstall', 'dependency')
  expect(removal.files[0]!.usedBy).toContainEqual({
    localId: campaign.localId,
    name: 'Campaign',
    type: 'campaign',
  })
  vi.spyOn(f.dependency, 'update').mockImplementation(() => {
    throw new Error('remove rollback')
  })
  await expect(
    f.service.remove(
      removal.removalId,
      removal.files.map((file) => ({ conflictId: file.conflictId, action: 'delete' })),
      'dependency',
    ),
  ).rejects.toThrow('remove rollback')
  expect(await readFile(dependency.installedFiles[0]!.absolutePath, 'utf8')).toBe('Library')
  expect(await readFile(dependency.descriptorPath, 'utf8')).toContain('Library')
  expect(f.dependency.getSnapshot().records).toHaveLength(1)
  expect(f.campaign.getSnapshot().records).toHaveLength(1)
})
