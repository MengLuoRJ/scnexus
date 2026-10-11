import { afterEach, expect, test, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, stat, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { ContentService } from '../content-package'
import { ERRORS } from '@scnexus/app-shared/errors/app.error'
import { openSource } from '../source'
import { detectCampaign } from '../auto-detector'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import { sevenZip, SevenZipRunner } from '../../../utils/7zip-wrapper'
import { validateCampaignRecord } from '../../../stores/campaign'
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
  return { root, source, game, paths, input, campaign, active, service }
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

test('customize auto remains unavailable', async () => {
  const f = await fixture({ 'Maps/Campaign/Level.SC2Map': 'map' })
  const result = await f.service.analyze('customize', f.input)
  expect(result.modes.auto).toBeNull()
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
