import { afterEach, expect, test, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import {
  convertDisplayChangelog,
  readDisplayChangelog,
  DISPLAY_CHANGELOG_MAX_BYTES,
} from '../display-changelog'
import { precheckPackage } from '../precheck'
import { createWorkshopService } from '../service'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
import { openSource, type ContentSource } from '../../content-package/source'
import { sevenZip } from '../../../utils/7zip-wrapper'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const convert = (text: string, extension = '.md') =>
  convertDisplayChangelog(Buffer.from(text), extension)

test('Markdown imports only basic display nodes and visible link/image text', () => {
  const doc = convert(
    '# Changes\n\n**Bold** and *italic* and ~~gone~~ and `code`\n- [visible](https://secret.invalid/path)\n- ![alternate](file:///private.png)\n\n2. second\n\n> quote\n\n```js\nconst x = 1\n```',
  )
  expect(doc.content.map((node) => node.type)).toEqual([
    'heading',
    'paragraph',
    'bulletList',
    'orderedList',
    'blockquote',
    'codeBlock',
  ])
  expect(doc.content[0]).toEqual({
    type: 'heading',
    attrs: { level: 1 },
    content: [{ type: 'text', text: 'Changes' }],
  })
  const serialized = JSON.stringify(doc)
  expect(serialized).toContain('visible')
  expect(serialized).toContain('alternate')
  expect(serialized).not.toMatch(/https:|file:|secret|private|language|"link"|"image"/)
  expect(doc.content[1]!.content!.filter((node) => node.marks).map((node) => node.marks)).toEqual([
    [{ type: 'bold' }],
    [{ type: 'italic' }],
    [{ type: 'strike' }],
    [{ type: 'code' }],
  ])
})

test('plain text is not interpreted as Markdown and empty text imports an explicit empty doc', () => {
  expect(convert('**literal**\r\nnext', '.txt').content).toEqual([
    { type: 'paragraph', content: [{ type: 'text', text: '**literal**' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'next' }] },
  ])
  expect(convert('')).toEqual({ type: 'doc', content: [] })
})

test.each([
  '<script>alert(1)</script>',
  '<img src="https://secret.invalid">',
  '[hidden][reference]\n[reference]: https://secret.invalid',
  '[bad](https://secret.invalid',
  '| one | two |\n| --- | --- |',
  '```\nunclosed',
  '100001. out of range',
  '> '.repeat(20) + 'deep',
  '\u0000binary',
])('unsupported conversion requires manual input: %s', (text) => {
  expect(() => convert(text)).toThrow(/CHANGELOG/)
})

test('limits cover UTF-8, serialized JSON, node count and text length', () => {
  expect(() => convert('x'.repeat(DISPLAY_CHANGELOG_MAX_BYTES + 1))).toThrow(/CHANGELOG/)
  expect(() => convert('"'.repeat(140000))).toThrow(/CHANGELOG/)
  expect(() => convert('汉'.repeat(100000))).toThrow(/CHANGELOG/)
  expect(() => convert(Array.from({ length: 2600 }, () => 'x').join('\n'))).toThrow(/CHANGELOG/)
  expect(() => convertDisplayChangelog(Buffer.from([0xff]), '.txt')).toThrow(/encoded data/)
  expect(() => convert('anything', '.html')).toThrow(/CHANGELOG/)
  expect(() => convert('```\n' + 'x'.repeat(32769) + '\n```')).toThrow(/CHANGELOG/)
})

function source(bytes = 4): ContentSource {
  return {
    input: { kind: 'archive', path: 'selected.zip' },
    tree: {} as ContentSource['tree'],
    entries: [{ path: 'notes.md', bytes, modifiedAt: null }],
    read: vi.fn<ContentSource['read']>(),
  }
}

test.each([
  '../outside.md',
  '/outside.md',
  '\\outside.md',
  'C:\\outside.md',
  'https://outside.invalid/a.md',
  'a/../../notes.md',
  'a//notes.md',
  'notes.md:stream',
  '*.md',
  'notes?.md',
  'missing.md',
])('rejects unsafe/missing package reference without reading: %s', async (changelog) => {
  const read = vi.spyOn(sevenZip, 'readFile')
  expect(await readDisplayChangelog(source(), { changelog })).toEqual({
    displayChangelogWarning: true,
  })
  expect(read).not.toHaveBeenCalled()
})

test('missing reference is absent, while oversized members and failed reads only warn', async () => {
  const read = vi.spyOn(sevenZip, 'readFile').mockRejectedValue(new Error('read failure'))
  expect(await readDisplayChangelog(source(), {})).toEqual({})
  expect(
    await readDisplayChangelog(source(DISPLAY_CHANGELOG_MAX_BYTES + 1), { changelog: 'notes.md' }),
  ).toEqual({ displayChangelogWarning: true })
  expect(read).not.toHaveBeenCalled()
  expect(await readDisplayChangelog(source(), { changelog: 'notes.md' })).toEqual({
    displayChangelogWarning: true,
  })
  expect(read).toHaveBeenCalledWith('selected.zip', 'notes.md', {
    maxBytes: DISPLAY_CHANGELOG_MAX_BYTES,
    timeout: 120000,
  })
  read.mockResolvedValue(Buffer.from('size mismatch'))
  expect(await readDisplayChangelog(source(), { changelog: 'notes.md' })).toEqual({
    displayChangelogWarning: true,
  })
})

async function archive(
  changelog = 'notes.md',
  text = '# Release\n\n[Changes](https://example.invalid)',
) {
  const root = await mkdtemp(join(process.cwd(), '.workshop-changelog-'))
  roots.push(root)
  const dir = join(root, 'source')
  await mkdir(dir)
  const manifest = {
    type: 'customize',
    name: 'Example',
    description: '',
    author: 'Tester',
    version: '1.0.0',
    mods: [],
    tags: ['tag'],
    localization: [{ locale: 'zh', name: 'Example' }],
    changelog,
  }
  await writeFile(join(dir, 'package.json'), JSON.stringify(manifest))
  await writeFile(join(dir, 'notes.md'), text)
  const path = join(root, 'release.zip')
  await sevenZip.add(path, ['package.json', 'notes.md'], { cwd: dir, archiveType: 'zip' })
  return { path, manifest }
}

test('real compressed package imports display independently of the frozen manifest, never patch', async () => {
  const { path, manifest } = await archive()
  const checked = await precheckPackage(path, 2147483647, true)
  expect(checked.manifest).toEqual(manifest)
  expect(checked.displayChangelog?.content[0]?.type).toBe('heading')
  expect(checked).not.toHaveProperty('patch')
  expect(checked).not.toHaveProperty('displayChangelogWarning')
  expect(await precheckPackage(path, 2147483647)).not.toHaveProperty('displayChangelog')
})

test('unsafe changelog references do not invalidate a valid selected package or expose local files', async () => {
  const { path } = await archive('../notes.md')
  const checked = await precheckPackage(path, 2147483647, true)
  expect(checked.displayChangelogWarning).toBe(true)
  expect(checked).not.toHaveProperty('displayChangelog')
})

test.each(['Symbolic Link', 'Hard Link'])(
  'archive %s members are rejected before changelog reading',
  async (property) => {
    const { path } = await archive()
    const listing = await sevenZip.list(path)
    const link = listing.entries.find((entry) => entry.path === 'notes.md')!
    link.properties[property] = '..\\outside.md'
    vi.spyOn(sevenZip, 'list').mockResolvedValue(listing)
    const read = vi.spyOn(sevenZip, 'readFile')
    await expect(openSource({ kind: 'archive', path })).rejects.toThrow(
      expect.objectContaining({ name: 'FILESYSTEM-PATH-REJECTED' }),
    )
    expect(read).not.toHaveBeenCalled()
  },
)

test('selection DTO includes display import and never exposes the local path or performs external reads', async () => {
  const { path, manifest } = await archive()
  const snapshot: AuthSnapshot = {
    status: 'signed-in',
    epoch: 1,
    version: 1,
    accessToken: 'token',
    accessExpiresAt: Date.now() + 100000,
    sessionId: '33333333-3333-4333-8333-333333333333',
    userId: '44444444-4444-4444-8444-444444444444',
    sessionExpiresAt: null,
    mfaExpiresAt: null,
  }
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          userId: snapshot.userId,
          maxProjects: 5,
          maxPackageBytes: 2147483647,
          maxStorageBytes: 0,
          usedStorageBytes: 0,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  )
  const service = await createWorkshopService({
    apiOrigin: 'https://api.example',
    workshopOrigin: 'https://packages.example',
    filesOrigin: 'https://images.example',
    getSnapshot: () => snapshot,
    getDownloadDirectory: () => join(path, '..', 'downloads'),
    refresh: async () => snapshot,
    enabled: () => true,
    emit: vi.fn<() => void>(),
    selectFile: async () => path,
    root: join(path, '..', 'workshop'),
    fetch,
  })
  try {
    const selection = await service.selectPackage()
    expect(selection?.manifest).toEqual(manifest)
    expect(selection?.displayChangelog?.content[0]?.type).toBe('heading')
    expect(selection).not.toHaveProperty('path')
    expect(selection).not.toHaveProperty('patch')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0]![0])).toBe('https://api.example/workshop/creator/quota')
  } finally {
    await service.dispose()
  }
})

test('compressed member expansion is bounded and HTML only produces a warning', async () => {
  for (const text of ['x'.repeat(DISPLAY_CHANGELOG_MAX_BYTES + 1), '<script>alert(1)</script>']) {
    const { path } = await archive('notes.md', text)
    const checked = await precheckPackage(path, 2147483647, true)
    expect(checked.displayChangelogWarning).toBe(true)
    expect(checked).not.toHaveProperty('displayChangelog')
  }
})
