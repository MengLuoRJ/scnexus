import { afterEach, expect, test, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ERRORS } from '@scnexus/app-shared/errors/app.error'
import { validateArchive } from '../validation'
import { sevenZip } from '../../../utils/7zip-wrapper'
import { ContentService } from '../content-package'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import type { ContentStore, CampaignActiveStoreData } from '@scnexus/app-shared/types/content.type'

function service(root: string) {
  const store: ContentStore = {
    _schemaVersion: 2,
    _revision: 0,
    records: [],
    legacyRecords: [],
    scannedAt: null,
  }
  const active: CampaignActiveStoreData = {
    _schemaVersion: 2,
    _revision: 0,
    active: {},
    legacyRecords: [],
    scannedAt: null,
  }
  const repository = <T>(data: T) => ({
    getSnapshot: () => structuredClone(data),
    update: (next: T) => {
      data = structuredClone(next)
    },
  })
  return new ContentService(
    async () => gamePaths(join(root, 'game'), join(root, 'documents')),
    repository(store),
    repository(store),
    repository(active),
    async (run) => run(),
  )
}

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(process.cwd(), '.validation-'))
  roots.push(root)
  const source = join(root, 'source')
  await mkdir(source)
  for (const [path, text] of Object.entries(files)) {
    const absolute = join(source, path)
    await mkdir(join(absolute, '..'), { recursive: true })
    await writeFile(absolute, text)
  }
  const path = join(root, 'source.zip')
  await sevenZip.add(path, ['.'], { cwd: source, archiveType: 'zip' })
  return { root, input: { kind: 'archive' as const, path } }
}
const manifest = JSON.stringify({
  name: 'Example',
  description: '',
  version: '1.0.0',
  author: 'Author',
  type: 'campaign',
  campaign: 'WOL',
})

test('CCM compatibility and all mode previews match campaign installation', async () => {
  const f = await fixture({
    'VioletsNCOMod/metadata.txt':
      'title=Nova: Violet Ops\ncampaign=NCO\nversion=1.02\nauthor=Violet Rose',
    'VioletsNCOMod/nova01.SC2Map': 'map',
  })
  await mkdir(join(f.root, 'game'))
  const result = await validateArchive(f.input)
  const installation = await service(f.root).analyze('campaign', f.input)
  expect(result.modes).toEqual(installation.modes)
  expect(result.modes.scnexus?.origin).toBe('ccm-converted')
  expect(result.descriptors.some((item) => item.standard === 'scnexus')).toBe(false)
  expect(result.modes.scnexus?.files[0].target).toBe('Maps/Campaign/nova/nova01.SC2Map')
  expect(result.modes.auto).toBeNull()
})

test('validates both standards without extraction, game configuration or writes', async () => {
  const f = await fixture({
    'package.json': manifest,
    'metadata.txt': 'title=CCM\ncampaign=WOL\nauthor=A',
    'Level.SC2Map': 'map',
    'Maps/Campaign/Level.SC2Map': 'map',
  })
  const before = await readdir(f.root, { recursive: true })
  const extract = vi.spyOn(sevenZip, 'extractExact')
  const result = await validateArchive(f.input)
  expect(result.descriptors.map((item) => [item.standard, item.valid])).toEqual([
    ['ccm', true],
    ['scnexus', true],
  ])
  expect(result.descriptors.find((item) => item.standard === 'scnexus')?.fields).toContainEqual({
    name: 'author',
    value: 'Author',
  })
  expect(result.automatic.preview).toBeNull()
  expect(result.automatic.diagnostic?.code).toBe('AUTO_DESCRIPTOR_PRESENT')
  expect(extract).not.toHaveBeenCalled()
  expect(await readdir(f.root, { recursive: true })).toEqual(before)
})

test('keeps raw fields from invalid descriptors and still validates CCM independently', async () => {
  const f = await fixture({
    'package.json': '{"name":"Broken","type":"invalid"}',
    'metadata.txt': 'title=CCM\ncampaign=WOL',
    'Level.SC2Map': 'map',
  })
  const result = await validateArchive(f.input)
  expect(result.descriptors.find((item) => item.standard === 'scnexus')).toMatchObject({
    valid: false,
    fields: [
      { name: 'name', value: 'Broken' },
      { name: 'type', value: 'invalid' },
    ],
  })
  expect(result.descriptors.find((item) => item.standard === 'ccm')?.valid).toBe(true)
  expect(result.diagnostic).not.toBeNull()
})

test('recognizes resources without descriptors automatically', async () => {
  const f = await fixture({ 'Maps/Campaign/MarSara01.SC2Map': 'map' })
  const result = await validateArchive(f.input)
  expect(result.descriptors).toEqual([])
  expect(result.automatic.contentType).toBe('campaign')
  expect(result.automatic.preview?.fileCount).toBe(1)
})

test('reports malformed JSON without aborting analysis', async () => {
  const f = await fixture({ 'package.json': '{invalid' })
  const result = await validateArchive(f.input)
  expect(result.descriptors[0]).toMatchObject({
    valid: false,
    fields: [],
    error: { code: ERRORS.ARCHIVE_METADATA_INVALID.code },
  })
})

test('reports missing declared resources while keeping parsed fields', async () => {
  const pkg = {
    ...JSON.parse(manifest),
    maps: [{ name: 'Missing.SC2Map', source_path: '/Maps/Campaign/Missing.SC2Map' }],
  }
  const f = await fixture({ 'package.json': JSON.stringify(pkg) })
  const result = await validateArchive(f.input)
  expect(result.descriptors[0]).toMatchObject({
    valid: false,
    package: { name: 'Example' },
    error: { code: ERRORS.ARCHIVE_METADATA_INVALID.code },
  })
  expect(result.descriptors[0].fields.some((field) => field.name === 'maps')).toBe(true)
})

test('reports type conflicts and preserves independent standard results', async () => {
  const pkg = { ...JSON.parse(manifest), type: 'customize' }
  delete pkg.campaign
  const f = await fixture({
    'package.json': JSON.stringify(pkg),
    'metadata.txt': 'title=CCM\ncampaign=WOL',
    'Level.SC2Map': 'map',
  })
  const result = await validateArchive(f.input)
  expect(result.diagnostic?.code).toBe(ERRORS.CONTENT_TYPE_CONFLICT.code)
  expect(result.descriptors).toHaveLength(2)
  expect(result.descriptors.find((item) => item.standard === 'ccm')?.valid).toBe(true)
})

test('does not treat descriptors inside SC2 resource components as package headers', async () => {
  const f = await fixture({ 'Maps/Campaign/Level.SC2Map/package.json': manifest })
  const result = await validateArchive(f.input)
  expect(result.descriptors).toEqual([])
  expect(result.automatic.diagnostic?.code).toBe('AUTO_DESCRIPTOR_PRESENT')
})

test('validates directories with the same results without modifying files', async () => {
  const f = await fixture({ 'package.json': manifest, 'Maps/Campaign/Level.SC2Map': 'map' })
  const path = join(f.root, 'source')
  const before = await readdir(path, { recursive: true })
  const archive = await validateArchive(f.input)
  const directory = await validateArchive({ kind: 'directory', path })
  expect(directory.descriptors.map(({ preview: _preview, ...descriptor }) => descriptor)).toEqual(
    archive.descriptors.map(({ preview: _preview, ...descriptor }) => descriptor),
  )
  expect(directory.sourceTree.children?.length).toBe(2)
  expect(archive.compressedBytes).toBeGreaterThan(0)
  expect(directory.compressedBytes).toBeUndefined()
  expect(directory.descriptors[0].preview?.files[0].source).toBe('Maps/Campaign/Level.SC2Map')
  expect(directory.fileCount).toBe(archive.fileCount)
  expect(directory.automatic.diagnostic).toEqual(archive.automatic.diagnostic)
  expect(await readdir(path, { recursive: true })).toEqual(before)
})
