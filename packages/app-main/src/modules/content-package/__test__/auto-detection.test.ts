import { afterEach, expect, test, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, stat, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { ContentService } from '../content-package'
import { ERRORS } from '@scnexus/app-shared/errors/app.error'
import { openSource } from '../source'
import { detectCampaign, detectCustomize } from '../auto-detector'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import { sevenZip, SevenZipRunner } from '../../../utils/7zip-wrapper'
import { validateCampaignRecord } from '../../../stores/campaign'
import { validateCustomizeRecord } from '../../../stores/customize'
import type {
  ContentStore,
  CampaignActiveStoreData,
  SourceInput,
} from '@scnexus/app-shared/types/content.type'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
function repository<T>(data: T) {
  return {
    getSnapshot: () => structuredClone(data),
    update(next: T) {
      data = structuredClone(next)
      return this.getSnapshot()
    },
  }
}
async function fixture(files: Record<string, string>, format?: 'zip' | '7z') {
  const root = await mkdtemp(join(process.cwd(), '.auto-detection-'))
  roots.push(root)
  const source = join(root, 'NoDescriptor')
  const game = join(root, 'game')
  await mkdir(source)
  await mkdir(game)
  for (const [path, text] of Object.entries(files)) {
    const file = join(source, path)
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, text)
  }
  let input: SourceInput = { kind: 'directory', path: source }
  if (format) {
    const archive = join(root, 'NoDescriptor.' + format)
    await sevenZip.add(archive, ['.'], {
      cwd: source,
      archiveType: format,
      ...(format === '7z' ? { solid: true } : {}),
    })
    input = { kind: 'archive', path: archive }
  }
  const paths = gamePaths(game, join(root, 'documents'))
  const initial: ContentStore = {
    _schemaVersion: 2,
    _revision: 0,
    records: [],
    legacyRecords: [],
    scannedAt: null,
  }
  const campaign = repository(initial)
  const customize = repository(initial)
  const active = repository<CampaignActiveStoreData>({
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
  return { root, source, game, paths, input, campaign, customize, active, service }
}
const layouts = [
  ['WOL', 'Maps/Campaign/Level.SC2Map'],
  ['HOTS', 'Maps/Campaign/swarm/Level.SC2Map'],
  ['HOTS', 'Maps/Campaign/swarm/evolution/Level.SC2Map'],
  ['LOTV', 'Maps/Campaign/void/Level.SC2Map'],
  ['LOTV', 'Maps/Campaign/voidprologue/Level.SC2Map'],
  ['NCO', 'Maps/Campaign/nova/Level.SC2Map'],
] as const

test.each(layouts)('recognizes %s from %s without a descriptor', async (campaign, path) => {
  const f = await fixture({
    ['Wrapper/' + path]: 'map',
    'Wrapper/Mods/Sub/Core.SC2Mod': 'mod',
    'Wrapper/readme.txt': 'not installed',
  })
  const result = await f.service.analyze('campaign', f.input)
  const preview = result.modes.auto!
  expect(result.modes.scnexus).toBeNull()
  expect(result.modes.ccm).toBeNull()
  expect(result.recommendedMode).toBeNull()
  expect(preview.package).toMatchObject({
    campaign,
    name: 'Wrapper',
    author: '',
    version: '',
    description: '',
  })
  expect(preview.origin).toBe('auto-detected')
  expect(preview.files.map((file) => file.target)).toEqual(
    expect.arrayContaining([path, 'Mods/Sub/Core.SC2Mod']),
  )
  expect(preview.fileCount).toBe(2)
  expect(await readdir(f.game)).toEqual([])
})

test.each([
  'package.json',
  'metadata.txt',
  'Wrapper/PACKAGE.JSON',
  'Wrapper/METADATA.TXT',
  'Mods/Core.SC2Mod/package.json',
  'Maps/Campaign/Level.SC2Map/metadata.txt',
])('any descriptor presence disables auto, even invalid or internal: %s', async (descriptor) => {
  const map = descriptor.startsWith('Maps/Campaign/Level.SC2Map/')
    ? 'Maps/Campaign/Level.SC2Map/data'
    : 'Maps/Campaign/Level.SC2Map'
  const f = await fixture({ [map]: 'map', [descriptor]: 'invalid' })
  const result = await f.service.analyze('campaign', f.input)
  expect(result.modes.auto).toBeNull()
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ mode: 'auto', code: 'AUTO_DESCRIPTOR_PRESENT' }),
  )
  await expect(
    f.service.install({ analysisId: result.analysisId, mode: 'auto', decisions: [] }, 'campaign'),
  ).rejects.toMatchObject({ code: ERRORS.CONTENT_TYPE_UNSUPPORTED.code })
})

test.each([
  [
    { 'Maps/Campaign/A.SC2Map': 'a', 'Maps/Campaign/swarm/B.SC2Map': 'b' },
    'AUTO_CAMPAIGN_AMBIGUOUS',
  ],
  [
    { 'One/Maps/Campaign/A.SC2Map': 'a', 'Two/Maps/Campaign/B.SC2Map': 'b' },
    'AUTO_LAYOUT_AMBIGUOUS',
  ],
  [{ 'Level.SC2Map': 'a' }, 'AUTO_LAYOUT_AMBIGUOUS'],
  [{ 'Mods/Core.SC2Mod': 'm' }, 'AUTO_CAMPAIGN_NOT_FOUND'],
  [{ 'Maps/Campaign/swarm/Extra/Level.SC2Map': 'm' }, 'AUTO_LAYOUT_UNSUPPORTED'],
] as const)('ambiguous or unrecognizable layouts stay unavailable', async (files, code) => {
  const f = await fixture(files)
  const result = await f.service.analyze('campaign', f.input)
  expect(result.modes.auto).toBeNull()
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ mode: 'auto', code }))
})

test('customize auto does not guess campaign identity', async () => {
  const f = await fixture({ 'Maps/Campaign/Level.SC2Map': 'map' })
  const result = await f.service.analyze('customize', f.input)
  expect(result.modes.auto?.package.type).toBe('customize')
  expect(result.modes.auto?.package.campaign).toBeUndefined()
})

test('normalizes path casing and components while preserving original source paths', async () => {
  const f = await fixture({
    'Wrapper/maps/campaign/SwArM/Level.SC2Map/data': 'map',
    'Wrapper/mods/Core.SC2Mod/data': 'mod',
  })
  const preview = detectCampaign(await openSource(f.input)).preview!
  expect(preview.package.campaign).toBe('HOTS')
  expect(preview.files).toContainEqual(
    expect.objectContaining({
      source: 'Wrapper/maps/campaign/SwArM/Level.SC2Map/data',
      target: 'Maps/Campaign/swarm/Level.SC2Map/data',
    }),
  )
  const result = await f.service.analyze('campaign', f.input)
  const record = await f.service.install(
    { analysisId: result.analysisId, mode: 'auto', decisions: [] },
    'campaign',
  )
  expect(
    await readFile(join(record.payloadDirectory!, 'Maps/Campaign/swarm/Level.SC2Map/data'), 'utf8'),
  ).toBe('map')
  const activation = await f.service.prepareActivation(record.localId)
  await f.service.activate(activation.activationId, [])
  expect(await readFile(join(f.game, 'Maps/Campaign/swarm/Level.SC2Map/data'), 'utf8')).toBe('map')
})

test.each([undefined, 'zip', '7z'] as const)(
  '%s auto supports install, duplicate detection, scan, activation, restore and uninstall',
  async (format) => {
    const f = await fixture(
      { 'Maps/Campaign/Level.SC2Map': 'map', 'Mods/Core.SC2Mod': 'mod', 'ignore.txt': 'ignore' },
      format,
    )
    const reads = vi.spyOn(sevenZip, 'readFile')
    const extract = vi.spyOn(sevenZip, 'extractExact')
    const spawn = vi.spyOn(SevenZipRunner.prototype, 'spawn')
    const analysis = await f.service.analyze('campaign', f.input)
    expect(analysis.modes.auto?.package.name).toBe('NoDescriptor')
    expect(reads).not.toHaveBeenCalled()
    expect(extract).not.toHaveBeenCalled()
    spawn.mockClear()
    const record = await f.service.install(
      { analysisId: analysis.analysisId, mode: 'auto', decisions: [] },
      'campaign',
    )
    validateCampaignRecord(record)
    expect(record.mode).toBe('scnexus')
    expect(record.origin).toBe('auto-detected')
    expect(record.ccmOriginal).toBeNull()
    expect(
      await readFile(join(record.payloadDirectory!, 'Maps/Campaign/Level.SC2Map'), 'utf8'),
    ).toBe('map')
    expect(await readFile(record.descriptorPath, 'utf8')).toContain('NoDescriptor')
    expect(reads).not.toHaveBeenCalled()
    expect(extract).toHaveBeenCalledTimes(format ? 1 : 0)
    expect(spawn.mock.calls).toHaveLength(format ? 1 : 0)
    await expect(stat(join(f.game, 'Mods/Core.SC2Mod'))).rejects.toMatchObject({ code: 'ENOENT' })
    const duplicate = await f.service.analyze('campaign', f.input)
    expect(duplicate.existingInstallations.auto[0]?.localId).toBe(record.localId)
    await expect(
      f.service.install(
        { analysisId: duplicate.analysisId, mode: 'auto', decisions: [] },
        'campaign',
      ),
    ).rejects.toMatchObject({ code: ERRORS.TASK_CONFLICT.code })
    const activation = await f.service.prepareActivation(record.localId)
    await f.service.activate(activation.activationId, [])
    expect(await readFile(join(f.game, 'Mods/Core.SC2Mod'), 'utf8')).toBe('mod')
    await f.service.scan()
    expect(
      f.service.list('campaign').records.find((item) => item.localId === record.localId)?.origin,
    ).toBe('auto-detected')
    const off = await f.service.prepareRemoval(record.localId, 'deactivate')
    await f.service.remove(off.removalId, [])
    const removal = await f.service.prepareRemoval(record.localId, 'uninstall')
    await f.service.remove(removal.removalId, [])
    expect(f.service.list('campaign').records).toEqual([])
    expect((await readdir(f.game)).filter((name) => name.startsWith('.scnexus-'))).toEqual([])
  },
)

test('directory resource changes and descriptors added after preview reject installation', async () => {
  const f = await fixture({ 'Maps/Campaign/Level.SC2Map': 'map' })
  const result = await f.service.analyze('campaign', f.input)
  const file = join(f.source, 'Maps/Campaign/Level.SC2Map')
  const previous = await stat(file)
  await writeFile(file, 'new')
  await utimes(file, previous.atime, previous.mtime)
  await expect(
    f.service.install({ analysisId: result.analysisId, mode: 'auto', decisions: [] }, 'campaign'),
  ).rejects.toMatchObject({ code: ERRORS.TASK_CONFLICT.code })
  const next = await f.service.analyze('campaign', f.input)
  await writeFile(join(f.source, 'package.json'), 'broken')
  await expect(
    f.service.install({ analysisId: next.analysisId, mode: 'auto', decisions: [] }, 'campaign'),
  ).rejects.toMatchObject({ code: ERRORS.TASK_CONFLICT.code })
})

test('archive changed after auto preview is rejected and staging is cleaned', async () => {
  const f = await fixture({ 'Maps/Campaign/Level.SC2Map': 'map' }, '7z')
  const result = await f.service.analyze('campaign', f.input)
  await writeFile(join(f.source, 'package.json'), 'broken')
  await sevenZip.add(f.input.path, ['package.json'], { cwd: f.source })
  await expect(
    f.service.install({ analysisId: result.analysisId, mode: 'auto', decisions: [] }, 'campaign'),
  ).rejects.toMatchObject({ code: ERRORS.TASK_CONFLICT.code })
  expect((await readdir(f.game)).filter((name) => name.startsWith('.scnexus-'))).toEqual([])
})

test.each(['zip', '7z'] as const)(
  '%s resource-internal descriptor disables automatic recognition without reading that descriptor',
  async (format) => {
    const f = await fixture(
      {
        'Maps/Campaign/Level.SC2Map/data': 'map',
        'Maps/Campaign/Level.SC2Map/metadata.txt': 'invalid',
      },
      format,
    )
    const reads = vi.spyOn(sevenZip, 'readFile')
    const analysis = await f.service.analyze('campaign', f.input)
    expect(analysis.modes.auto).toBeNull()
    expect(reads).not.toHaveBeenCalled()
    expect(analysis.diagnostics).toContainEqual(
      expect.objectContaining({ mode: 'auto', code: 'AUTO_DESCRIPTOR_PRESENT' }),
    )
  },
)

test('new descriptor-named empty directory after preview also disables automatic installation', async () => {
  const f = await fixture({ 'Maps/Campaign/Level.SC2Map': 'map' })
  const analysis = await f.service.analyze('campaign', f.input)
  await mkdir(join(f.source, 'metadata.txt'))
  await expect(
    f.service.install({ analysisId: analysis.analysisId, mode: 'auto', decisions: [] }, 'campaign'),
  ).rejects.toMatchObject({ code: ERRORS.TASK_CONFLICT.code })
  expect(await readdir(f.game)).toEqual([])
})

test('automatic installation rolls back management directory on persistence failure', async () => {
  const f = await fixture({ 'Maps/Campaign/Level.SC2Map': 'map' }, '7z')
  const analysis = await f.service.analyze('campaign', f.input)
  vi.spyOn(f.campaign, 'update').mockImplementationOnce(() => {
    throw new Error('Store write failed')
  })
  await expect(
    f.service.install({ analysisId: analysis.analysisId, mode: 'auto', decisions: [] }, 'campaign'),
  ).rejects.toThrow('Store write failed')
  expect(f.campaign.getSnapshot().records).toEqual([])
  expect(await readdir(f.paths.customizeDataRoot)).toEqual([])
  expect((await readdir(f.game)).filter((name) => name.startsWith('.scnexus-'))).toEqual([])
})

test.each([undefined, 'zip', '7z'] as const)(
  '%s customize auto directly installs components, ignores CCM metadata, scans and uninstalls',
  async (format) => {
    const f = await fixture(
      {
        'Wrapper/maps/Anything/Nested/Level.SC2Map/data': 'map',
        'Wrapper/mods/Core.SC2Mod/data': 'mod',
        'Wrapper/metadata.txt': 'not CCM metadata',
        'Wrapper/mods/Core.SC2Mod/metadata.txt': 'resource data',
      },
      format,
    )
    const reads = vi.spyOn(sevenZip, 'readFile')
    const extract = vi.spyOn(sevenZip, 'extractExact')
    const spawn = vi.spyOn(SevenZipRunner.prototype, 'spawn')
    const analysis = await f.service.analyze('customize', f.input)
    const preview = analysis.modes.auto!
    expect(preview.package).toMatchObject({
      name: 'Wrapper',
      type: 'customize',
      author: '',
      version: '',
      description: '',
    })
    expect(preview.package.campaign).toBeUndefined()
    expect(preview.fileCount).toBe(3)
    expect(reads).not.toHaveBeenCalled()
    expect(extract).not.toHaveBeenCalled()
    spawn.mockClear()
    const progress =
      vi.fn<(progress: import('@scnexus/app-shared/types/content.type').InstallProgress) => void>()
    const record = await f.service.install(
      { analysisId: analysis.analysisId, mode: 'auto', decisions: [] },
      'customize',
      progress,
    )
    validateCustomizeRecord(record)
    expect(record.mode).toBe('scnexus')
    expect(record.origin).toBe('auto-detected')
    expect(record.payloadDirectory).toBeNull()
    expect(record.ccmOriginal).toBeNull()
    expect(await readFile(join(f.game, 'Maps/Anything/Nested/Level.SC2Map/data'), 'utf8')).toBe(
      'map',
    )
    expect(await readFile(join(f.game, 'Mods/Core.SC2Mod/metadata.txt'), 'utf8')).toBe(
      'resource data',
    )
    expect((await readdir(record.managementDirectory)).sort()).toEqual([
      'install-manifest.json',
      'package.json',
    ])
    expect(reads).not.toHaveBeenCalled()
    expect(extract).toHaveBeenCalledTimes(format ? 1 : 0)
    expect(spawn.mock.calls).toHaveLength(format ? 1 : 0)
    expect(progress.mock.calls.at(-1)?.[0].stage).toBe('completed')
    await f.service.scan()
    expect(f.service.list('customize').records[0].origin).toBe('auto-detected')
    const removal = await f.service.prepareRemoval(record.localId, 'uninstall', 'customize')
    await f.service.remove(removal.removalId, [], 'customize')
    await expect(stat(join(f.game, 'Mods/Core.SC2Mod'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(f.service.list('customize').records).toEqual([])
  },
)

test.each([undefined, 'zip', '7z'] as const)(
  '%s customize keep does not acquire ownership and overwrite does',
  async (format) => {
    const f = await fixture(
      { 'Maps/Level.SC2Map': 'new map', 'Mods/Core.SC2Mod': 'new mod' },
      format,
    )
    await mkdir(join(f.game, 'Maps'))
    await mkdir(join(f.game, 'Mods'))
    await writeFile(join(f.game, 'Maps/Level.SC2Map'), 'local map')
    await writeFile(join(f.game, 'Mods/Core.SC2Mod'), 'local mod')
    const analysis = await f.service.analyze('customize', f.input)
    const conflicts = analysis.conflicts.find((group) => group.mode === 'auto')!.files
    const record = await f.service.install(
      {
        analysisId: analysis.analysisId,
        mode: 'auto',
        decisions: conflicts.map((conflict) => ({
          conflictId: conflict.conflictId,
          action: conflict.type === 'map' ? 'keep' : 'overwrite',
        })),
      },
      'customize',
    )
    expect(record.installedFiles.map((file) => file.result).sort()).toEqual(['kept', 'replaced'])
    await f.service.scan()
    await writeFile(join(f.game, 'Maps/Level.SC2Map'), 'changed local map after scan')
    const removal = await f.service.prepareRemoval(record.localId, 'uninstall', 'customize')
    expect(removal.files).toEqual([])
    await f.service.remove(removal.removalId, [], 'customize')
    expect(await readFile(join(f.game, 'Maps/Level.SC2Map'), 'utf8')).toBe(
      'changed local map after scan',
    )
    await expect(stat(join(f.game, 'Mods/Core.SC2Mod'))).rejects.toMatchObject({ code: 'ENOENT' })
  },
)

test.each(['package.json', 'Wrapper/PACKAGE.JSON', 'Mods/Core.SC2Mod/PACKAGE.JSON'])(
  'customize package gate includes invalid and internal descriptors: %s',
  async (descriptor) => {
    const f = await fixture(
      { 'Maps/Level.SC2Map': 'map', 'Mods/Core.SC2Mod/data': 'mod', [descriptor]: 'invalid' },
      '7z',
    )
    const reads = vi.spyOn(sevenZip, 'readFile')
    const analysis = await f.service.analyze('customize', f.input)
    expect(analysis.modes.auto).toBeNull()
    expect(analysis.modes.scnexus).toBeNull()
    expect(reads.mock.calls.map((call) => call[1])).toEqual(
      descriptor.includes('.SC2Mod/') ? [] : [descriptor],
    )
    expect(analysis.diagnostics).toContainEqual(
      expect.objectContaining({ mode: 'auto', code: 'AUTO_DESCRIPTOR_PRESENT' }),
    )
  },
)

test('customize package-named empty directories block auto', async () => {
  const f = await fixture({ 'Maps/Level.SC2Map': 'map' }, 'zip')
  await mkdir(join(f.source, 'PACKAGE.JSON'))
  await sevenZip.add(f.input.path, ['PACKAGE.JSON'], { cwd: f.source })
  expect((await f.service.analyze('customize', f.input)).modes.auto).toBeNull()
})

test.each([
  { 'One/Maps/A.SC2Map': 'a', 'Two/Mods/B.SC2Mod': 'b' },
  { 'Loose.SC2Map': 'a', 'Maps/A.SC2Map': 'b' },
  { 'Mods/A.SC2Map': 'a' },
])('customize rejects ambiguous or loose resource layouts', async (files) => {
  const f = await fixture(files, 'zip')
  expect((await f.service.analyze('customize', f.input)).modes.auto).toBeNull()
})

test('customize SCNexus does not read or persist nearby metadata.txt', async () => {
  const pkg = {
    name: 'Declared',
    type: 'customize',
    author: '',
    description: '',
    version: '',
    maps: [{ name: 'A.SC2Map', source_path: '/Maps/A.SC2Map' }],
  }
  const f = await fixture(
    { 'package.json': JSON.stringify(pkg), 'metadata.txt': 'invalid', 'Maps/A.SC2Map': 'map' },
    '7z',
  )
  const reads = vi.spyOn(sevenZip, 'readFile')
  const analysis = await f.service.analyze('customize', f.input)
  expect(reads.mock.calls.map((call) => call[1])).toEqual(['package.json'])
  const record = await f.service.install(
    { analysisId: analysis.analysisId, mode: 'scnexus', decisions: [] },
    'customize',
  )
  expect(record.ccmOriginal).toBeNull()
  expect(await readdir(record.managementDirectory)).not.toContain('metadata.txt')
})

test('customize persistence failure rolls back overwritten resources and management', async () => {
  const f = await fixture({ 'Maps/A.SC2Map': 'new' }, '7z')
  await mkdir(join(f.game, 'Maps'))
  await writeFile(join(f.game, 'Maps/A.SC2Map'), 'old')
  const analysis = await f.service.analyze('customize', f.input)
  vi.spyOn(f.customize, 'update').mockImplementationOnce(() => {
    throw new Error('Store write failed')
  })
  await expect(
    f.service.install(
      {
        analysisId: analysis.analysisId,
        mode: 'auto',
        decisions: analysis.conflicts
          .find((group) => group.mode === 'auto')!
          .files.map((conflict) => ({ conflictId: conflict.conflictId, action: 'overwrite' })),
      },
      'customize',
    ),
  ).rejects.toThrow('Store write failed')
  expect(await readFile(join(f.game, 'Maps/A.SC2Map'), 'utf8')).toBe('old')
  expect(await readdir(f.paths.customizeDataRoot)).toEqual([])
  expect(f.customize.getSnapshot().records).toEqual([])
})

test.each(['keep', 'delete'] as const)(
  'customize shared references require and honor %s removal decisions',
  async (action) => {
    const f = await fixture({ 'Mods/A.SC2Mod': 'mod' })
    const install = async (name: string) => {
      await writeFile(
        join(f.source, 'package.json'),
        JSON.stringify({
          name,
          type: 'customize',
          author: '',
          description: '',
          version: '',
          mods: [{ name: 'A.SC2Mod', source_path: '/Mods/A.SC2Mod' }],
        }),
      )
      const analysis = await f.service.analyze('customize', f.input)
      return f.service.install(
        {
          analysisId: analysis.analysisId,
          mode: 'scnexus',
          decisions: analysis.conflicts
            .find((group) => group.mode === 'scnexus')!
            .files.map((conflict) => ({ conflictId: conflict.conflictId, action: 'overwrite' })),
        },
        'customize',
      )
    }
    const first = await install('One')
    const second = await install('Two')
    const removal = await f.service.prepareRemoval(first.localId, 'uninstall', 'customize')
    expect(removal.files[0].usedBy[0].localId).toBe(second.localId)
    await expect(f.service.remove(removal.removalId, [], 'customize')).rejects.toMatchObject({
      code: ERRORS.TASK_CONFLICT.code,
    })
    await f.service.remove(
      removal.removalId,
      [{ conflictId: removal.files[0].conflictId, action }],
      'customize',
    )
    expect(
      await stat(join(f.game, 'Mods/A.SC2Mod')).then(
        () => true,
        () => false,
      ),
    ).toBe(action === 'keep')
    const final = await f.service.prepareRemoval(second.localId, 'uninstall', 'customize')
    await f.service.remove(final.removalId, [], 'customize')
    await expect(stat(join(f.game, 'Mods/A.SC2Mod'))).rejects.toMatchObject({ code: 'ENOENT' })
  },
)

test('customize descriptor and source mutations after preview reject', async () => {
  const f = await fixture({ 'Maps/A.SC2Map': 'map' })
  const analysis = await f.service.analyze('customize', f.input)
  await mkdir(join(f.source, 'PACKAGE.JSON'))
  await expect(
    f.service.install(
      { analysisId: analysis.analysisId, mode: 'auto', decisions: [] },
      'customize',
    ),
  ).rejects.toMatchObject({ code: ERRORS.TASK_CONFLICT.code })
  await rm(join(f.source, 'PACKAGE.JSON'), { recursive: true })
  const next = await f.service.analyze('customize', f.input)
  await writeFile(join(f.source, 'Maps/A.SC2Map'), 'new')
  await expect(
    f.service.install({ analysisId: next.analysisId, mode: 'auto', decisions: [] }, 'customize'),
  ).rejects.toMatchObject({ code: ERRORS.TASK_CONFLICT.code })
})

test('customize rejects case-ambiguous resource roots without canonical merging', async () => {
  const f = await fixture({ 'Maps/A.SC2Map/data': 'a', 'Maps/A.SC2Map/other': 'b' })
  const source = await openSource(f.input)
  source.entries[1].path = 'maps/A.SC2Map/other'
  expect(detectCustomize(source).diagnostic?.code).toBe('AUTO_LAYOUT_AMBIGUOUS')
})

test('customize rechecks direct conflicts after lengthy archive extraction', async () => {
  const f = await fixture({ 'Maps/A.SC2Map': 'map' }, '7z')
  await mkdir(join(f.game, 'Maps'))
  await writeFile(join(f.game, 'Maps/A.SC2Map'), 'old')
  const analysis = await f.service.analyze('customize', f.input)
  const extract = sevenZip.extractExact.bind(sevenZip)
  vi.spyOn(sevenZip, 'extractExact').mockImplementationOnce(async (...args) => {
    const result = await extract(...args)
    await writeFile(join(f.game, 'Maps/A.SC2Map'), 'changed during extraction')
    return result
  })
  await expect(
    f.service.install(
      {
        analysisId: analysis.analysisId,
        mode: 'auto',
        decisions: analysis.conflicts
          .find((group) => group.mode === 'auto')!
          .files.map((conflict) => ({ conflictId: conflict.conflictId, action: 'overwrite' })),
      },
      'customize',
    ),
  ).rejects.toMatchObject({ code: ERRORS.TASK_CONFLICT.code })
  expect(await readFile(join(f.game, 'Maps/A.SC2Map'), 'utf8')).toBe('changed during extraction')
  expect(f.customize.getSnapshot().records).toEqual([])
})

test('campaign kept activation files also do not gain removal ownership', async () => {
  const f = await fixture({ 'Maps/Campaign/A.SC2Map': 'map', 'Mods/A.SC2Mod': 'mod' })
  await mkdir(join(f.game, 'Mods'))
  await writeFile(join(f.game, 'Mods/A.SC2Mod'), 'local')
  const analysis = await f.service.analyze('campaign', f.input)
  const record = await f.service.install(
    { analysisId: analysis.analysisId, mode: 'auto', decisions: [] },
    'campaign',
  )
  const activation = await f.service.prepareActivation(record.localId)
  await f.service.activate(
    activation.activationId,
    activation.conflicts.map((conflict) => ({ conflictId: conflict.conflictId, action: 'keep' })),
  )
  const removal = await f.service.prepareRemoval(record.localId, 'deactivate', 'campaign')
  await f.service.remove(removal.removalId, [], 'campaign')
  expect(await readFile(join(f.game, 'Mods/A.SC2Mod'), 'utf8')).toBe('local')
})

test.each(['zip', '7z'] as const)(
  '%s customize all-kept archive installs only management metadata',
  async (format) => {
    const f = await fixture({ 'Maps/A.SC2Map': 'new' }, format)
    await mkdir(join(f.game, 'Maps'))
    await writeFile(join(f.game, 'Maps/A.SC2Map'), 'local')
    const analysis = await f.service.analyze('customize', f.input)
    const extract = vi.spyOn(sevenZip, 'extractExact')
    const record = await f.service.install(
      {
        analysisId: analysis.analysisId,
        mode: 'auto',
        decisions: analysis.conflicts
          .find((group) => group.mode === 'auto')!
          .files.map((conflict) => ({ conflictId: conflict.conflictId, action: 'keep' })),
      },
      'customize',
    )
    expect(record.installedFiles[0].result).toBe('kept')
    expect(extract).not.toHaveBeenCalled()
    const removal = await f.service.prepareRemoval(record.localId, 'uninstall', 'customize')
    await f.service.remove(removal.removalId, [], 'customize')
    expect(await readFile(join(f.game, 'Maps/A.SC2Map'), 'utf8')).toBe('local')
  },
)

test('customize kept survivors remain shared references without gaining deletion ownership', async () => {
  const f = await fixture({ 'Mods/A.SC2Mod': 'mod' })
  const firstAnalysis = await f.service.analyze('customize', f.input)
  const owner = await f.service.install(
    { analysisId: firstAnalysis.analysisId, mode: 'auto', decisions: [] },
    'customize',
  )
  await writeFile(
    join(f.source, 'package.json'),
    JSON.stringify({
      name: 'Read-only survivor',
      type: 'customize',
      author: '',
      version: '',
      description: '',
      mods: [{ name: 'A.SC2Mod', source_path: '/Mods/A.SC2Mod' }],
    }),
  )
  const secondAnalysis = await f.service.analyze('customize', f.input)
  const survivor = await f.service.install(
    {
      analysisId: secondAnalysis.analysisId,
      mode: 'scnexus',
      decisions: secondAnalysis.conflicts
        .find((group) => group.mode === 'scnexus')!
        .files.map((conflict) => ({ conflictId: conflict.conflictId, action: 'keep' })),
    },
    'customize',
  )
  expect(survivor.installedFiles[0].result).toBe('kept')
  const removal = await f.service.prepareRemoval(owner.localId, 'uninstall', 'customize')
  expect(removal.files[0].usedBy).toContainEqual(
    expect.objectContaining({ localId: survivor.localId }),
  )
  await f.service.remove(
    removal.removalId,
    [{ conflictId: removal.files[0].conflictId, action: 'keep' }],
    'customize',
  )
  await f.service.scan()
  const final = await f.service.prepareRemoval(survivor.localId, 'uninstall', 'customize')
  expect(final.files).toEqual([])
  await f.service.remove(final.removalId, [], 'customize')
  expect(await readFile(join(f.game, 'Mods/A.SC2Mod'), 'utf8')).toBe('mod')
})
