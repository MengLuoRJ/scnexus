import { afterEach, expect, test, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ContentService } from '../content-package'
import { classifySource } from '../classification'
import { openSource } from '../source'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import { sevenZip } from '../../../utils/7zip-wrapper'
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
    update: (next: T) => (data = structuredClone(next)),
  }
}
async function fixture(files: Record<string, string>, directories: string[] = [], archive = false) {
  const root = await mkdtemp(join(process.cwd(), '.classification-'))
  roots.push(root)
  const source = join(root, 'source')
  const game = join(root, 'game')
  await mkdir(source)
  await mkdir(game)
  for (const path of directories) await mkdir(join(source, path), { recursive: true })
  for (const [path, text] of Object.entries(files)) {
    const absolute = join(source, path)
    await mkdir(join(absolute, '..'), { recursive: true })
    await writeFile(absolute, text)
  }
  let input: SourceInput = { kind: 'directory', path: source }
  if (archive) {
    input = { kind: 'archive', path: join(root, 'source.7z') }
    await sevenZip.add(input.path, ['.'], { cwd: source, archiveType: '7z', solid: true })
  }
  const initial: ContentStore = {
    _schemaVersion: 2,
    _revision: 0,
    records: [],
    legacyRecords: [],
    scannedAt: null,
  }
  const service = new ContentService(
    async () => gamePaths(game, join(root, 'documents')),
    repository(initial),
    repository(initial),
    repository<CampaignActiveStoreData>({
      _schemaVersion: 2,
      _revision: 0,
      active: {},
      legacyRecords: [],
      scannedAt: null,
    }),
    async (run) => run(),
  )
  return { root, source, game, input, service }
}
const pkg = (type: 'campaign' | 'customize') =>
  JSON.stringify({
    name: type,
    description: '',
    author: '',
    version: '',
    type,
    ...(type === 'campaign' ? { campaign: 'WOL' } : {}),
    maps: [{ name: 'Level.SC2Map', source_path: '/Maps/Campaign/Level.SC2Map' }],
  })
const metadata = 'title=CCM\ncampaign=WOL\nversion=1\nauthor=A'
const dual = (type: 'campaign' | 'customize') => ({
  'package.json': pkg(type),
  'metadata.txt': metadata,
  'Maps/Campaign/Level.SC2Map': 'map',
  'Level.SC2Map': 'ccm map',
})

test.each(['campaign', 'customize'] as const)(
  'package internal type classifies %s',
  async (type) => {
    const f = await fixture({ 'package.json': pkg(type), 'Maps/Campaign/Level.SC2Map': 'map' })
    const result = await f.service.analyzeContent(f.input)
    expect(result.contentType).toBe(type)
    expect(result.modes.scnexus?.package.type).toBe(type)
  },
)

test('metadata-only is campaign with converted SCNexus and CCM modes', async () => {
  const f = await fixture({ 'metadata.txt': metadata, 'Level.SC2Map': 'map' })
  const result = await f.service.analyzeContent(f.input)
  expect(result.contentType).toBe('campaign')
  expect(result.modes.scnexus?.origin).toBe('ccm-converted')
  expect(result.modes.ccm?.origin).toBe('metadata-txt')
})

test.each([false, true])(
  'package.json wins by default; explicit legacy descriptor selection remains supported (archive=%s)',
  async (archive) => {
    const f = await fixture(dual('customize'), [], archive)
    const extract = vi.spyOn(sevenZip, 'extractExact')
    const list = vi.spyOn(sevenZip, 'list')
    const descriptorRead = vi.spyOn(sevenZip, 'readFile')
    const prioritized = await f.service.analyzeContent(f.input)
    expect(prioritized.contentType).toBe('customize')
    expect(prioritized.modes.ccm).toBeNull()
    const work = await f.service.analyzeContent(f.input, 'package-json')
    expect(work.contentType).toBe('customize')
    expect(work.modes.ccm).toBeNull()
    expect(work.modes.scnexus?.package.name).toBe('customize')
    const campaign = await f.service.analyzeContent(f.input, 'metadata-txt')
    expect(campaign.contentType).toBe('campaign')
    expect(campaign.modes.scnexus?.origin).toBe('ccm-converted')
    expect(campaign.modes.scnexus?.package.name).toBe('CCM')
    expect(campaign.modes.scnexus?.files.map((file) => file.source)).toEqual(['Level.SC2Map'])
    expect(extract).not.toHaveBeenCalled()
    expect(list).toHaveBeenCalledTimes(archive ? 3 : 0)
    expect(descriptorRead).toHaveBeenCalledTimes(archive ? 6 : 0)
    expect(await readdir(f.game)).toEqual([])
    const installed = await f.service.install(
      { analysisId: work.analysisId, mode: 'scnexus', decisions: [] },
      'customize',
    )
    expect(installed.ccmOriginal).toBeNull()
    const imported = await f.service.install(
      { analysisId: campaign.analysisId, mode: 'scnexus', decisions: [] },
      'campaign',
    )
    expect(imported.package.name).toBe('CCM')
    expect(imported.ccmOriginal?.text).toBe(metadata)
  },
)

test('same-type descriptors prioritize package.json', async () => {
  const f = await fixture(dual('campaign'))
  const result = await f.service.analyzeContent(f.input)
  expect(result.contentType).toBe('campaign')
  expect(result.modes.scnexus?.package.name).toBe('campaign')
  expect(result.modes.ccm).toBeNull()
  await expect(f.service.analyzeContent(f.input, 'metadata-txt')).rejects.toMatchObject({
    code: 'M003',
  })
})

test.each([
  { 'package.json': '{' },
  { 'metadata.txt': 'title=bad\ncampaign=WRONG' },
  { 'package.json': pkg('customize'), 'metadata.txt': 'bad' },
  { 'package.json': '{', 'metadata.txt': metadata },
])('malformed descriptor never falls back to another descriptor or auto', async (files) => {
  const f = await fixture({ ...files, 'Maps/Campaign/Level.SC2Map': 'map', 'Level.SC2Map': 'map' })
  await expect(f.service.analyzeContent(f.input)).rejects.toMatchObject({ code: 'M034' })
})

test('multiple outermost package roots are a business error', async () => {
  const f = await fixture({
    'One/package.json': pkg('customize'),
    'One/Maps/Campaign/Level.SC2Map': 'one',
    'Two/package.json': pkg('customize'),
    'Two/Maps/Campaign/Level.SC2Map': 'two',
  })
  await expect(f.service.analyzeContent(f.input)).rejects.toMatchObject({ code: 'M034' })
})

test('outermost installable descriptor remains the root', async () => {
  const f = await fixture({
    'package.json': pkg('campaign'),
    'Maps/Campaign/Level.SC2Map': 'one',
    'Nested/package.json': pkg('customize'),
    'Nested/Maps/Campaign/Level.SC2Map': 'two',
  })
  expect((await f.service.analyzeContent(f.input)).contentType).toBe('campaign')
})

test.each([
  'Maps/Campaign/Level.SC2Map',
  'Maps/Campaign/swarm/Level.SC2Map',
  'Maps/Campaign/swarm/evolution/Level.SC2Map',
  'Maps/Campaign/void/Level.SC2Map',
  'Maps/Campaign/voidprologue/Level.SC2Map',
  'Maps/Campaign/nova/Level.SC2Map',
  'Wrapper/mApS/cAmPaIgN/nOvA/Level.SC2Map',
])('official hierarchy classifies campaign: %s', async (path) => {
  const f = await fixture({ [path]: 'map' })
  const result = await f.service.analyzeContent(f.input)
  expect(result.contentType).toBe('campaign')
  expect(result.modes.auto).not.toBeNull()
})

test.each([false, true])(
  'empty official directory counts and remains campaign diagnostic (archive=%s)',
  async (archive) => {
    const f = await fixture(
      { 'Wrapper/Mods/Core.SC2Mod': 'mod' },
      ['Wrapper/mApS/cAmPaIgN/nOvA'],
      archive,
    )
    const source = await openSource(f.input)
    expect(source.directories).toContain('Wrapper/mApS/cAmPaIgN/nOvA')
    const result = await f.service.analyzeContent(f.input)
    expect(result.contentType).toBe('campaign')
    expect(result.modes.auto).toBeNull()
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'AUTO_CAMPAIGN_NOT_FOUND' }),
    )
  },
)

test.each([
  'Mods/Core.SC2Mod/Maps/Campaign/data',
  'Maps/Arcade/Level.SC2Map/Maps/Campaign/data',
  'Maps/Arcade/Level.SC2Map/Campaign/data',
])('asset-internal Campaign directories do not classify campaign: %s', async (path) => {
  const f = await fixture({ [path]: 'map data' })
  expect((await f.service.analyzeContent(f.input)).contentType).toBe('customize')
})

test('asset metadata is excluded from classification, but preserves strict campaign auto gate', async () => {
  const f = await fixture({
    'Maps/Campaign/Level.SC2Map/metadata.txt': 'asset',
    'Maps/Campaign/Level.SC2Map/data': 'map',
  })
  const result = await f.service.analyzeContent(f.input)
  expect(result.contentType).toBe('campaign')
  expect(result.modes.auto).toBeNull()
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'AUTO_DESCRIPTOR_PRESENT' }),
  )
})

test('no official directory classifies customize and empty content retains backend diagnosis', async () => {
  const f = await fixture({ 'Maps/Arcade/Level.SC2Map': 'map' })
  expect((await f.service.analyzeContent(f.input)).contentType).toBe('customize')
  const empty = await fixture({})
  const result = await empty.service.analyzeContent(empty.input)
  expect(result.contentType).toBe('customize')
  expect(result.modes.auto).toBeNull()
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'AUTO_LAYOUT_UNSUPPORTED' }),
  )
})

test('ambiguous campaign content remains campaign, not customize fallback', async () => {
  const f = await fixture({
    'Maps/Campaign/Level.SC2Map': 'map',
    'Maps/Campaign/nova/Level.SC2Map': 'map',
  })
  const result = await f.service.analyzeContent(f.input)
  expect(result.contentType).toBe('campaign')
  expect(result.modes.auto).toBeNull()
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'AUTO_CAMPAIGN_AMBIGUOUS' }),
  )
})

test('descriptor reads share a single source snapshot and reject mutation after preview', async () => {
  const f = await fixture(dual('campaign'))
  const result = await f.service.analyzeContent(f.input)
  await writeFile(join(f.source, 'package.json'), pkg('customize'))
  await expect(
    f.service.install({ analysisId: result.analysisId, mode: 'scnexus', decisions: [] }),
  ).rejects.toMatchObject({ code: 'M051' })
})

test('same-name descriptor directories cannot fall back to auto', async () => {
  const f = await fixture({ 'Maps/Arcade/Level.SC2Map': 'map' }, ['package.json'])
  await expect(f.service.analyzeContent(f.input)).rejects.toMatchObject({ code: 'M034' })
})

test('descriptor mutation during unified analysis rejects its cached snapshot', async () => {
  const f = await fixture(
    { 'package.json': pkg('customize'), 'Maps/Campaign/Level.SC2Map': 'map' },
    [],
    true,
  )
  const original = sevenZip.readFile.bind(sevenZip)
  vi.spyOn(sevenZip, 'readFile').mockImplementationOnce(async (...args) => {
    const data = await original(...args)
    await writeFile(f.input.path, 'changed archive')
    return data
  })
  await expect(f.service.analyzeContent(f.input)).rejects.toMatchObject({ code: 'M051' })
})

test('classification reads each descriptor once and rejects choices without conflict', async () => {
  const f = await fixture({ 'package.json': pkg('customize'), 'Maps/Campaign/Level.SC2Map': 'map' })
  const source = await openSource(f.input)
  const read = vi.spyOn(source, 'read')
  await classifySource(source)
  expect(read).toHaveBeenCalledExactlyOnceWith('package.json')
  await expect(f.service.analyzeContent(f.input, 'package-json')).rejects.toMatchObject({
    code: 'M003',
  })
  await expect(f.service.analyzeContent(f.input, 'bad' as 'package-json')).rejects.toMatchObject({
    code: 'M003',
  })
})
