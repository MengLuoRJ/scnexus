import { afterEach, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { mkdtemp, mkdir, writeFile, rm, symlink, lstat, realpath } from 'node:fs/promises'
import type { Package } from '@scnexus/app-shared/types/content.type'
import { ERRORS } from '@scnexus/app-shared/errors/app.error'
import { buildPreview } from '../parser'
import { makeTree, openSource, type ContentSource, type Entry } from '../source'
import { resourceState } from '../resources'
import { keyPath, safePath } from '../paths'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    lstat: vi.fn<typeof actual.lstat>(actual.lstat),
    realpath: vi.fn<typeof actual.realpath>(actual.realpath),
  }
})
vi.mock('../paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../paths')>()
  return { ...actual, keyPath: vi.fn<typeof actual.keyPath>(actual.keyPath) }
})

const roots: string[] = []
afterEach(async () => {
  vi.clearAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture() {
  const root = await mkdtemp(join(process.cwd(), '.content-performance-'))
  roots.push(root)
  return root
}
function source(entries: Entry[]): ContentSource {
  return {
    input: { kind: 'directory', path: 'unused' },
    entries,
    tree: makeTree([], 'source'),
    read: async () => Buffer.from(''),
  }
}
function pkg(maps: Package['maps'] = []): Package {
  return { name: 'Group', description: '', version: '1', author: 'Test', type: 'customize', maps }
}
function entry(path: string): Entry {
  return { path, bytes: 3, modifiedAt: 123 }
}

test.each(['group', 'individual'] as const)(
  'large %s package uses bounded entry lookups and target normalization',
  (mode) => {
    const count = 2000
    let reads = 0
    const entries = Array.from({ length: count }, (_, index) => {
      const path = mode === 'group' ? `Maps/Group.SC2Map/${index}` : `Maps/${index}.SC2Map`
      return {
        get path() {
          reads++
          return path
        },
        bytes: 3,
        modifiedAt: 123,
      }
    })
    const maps =
      mode === 'group'
        ? [{ name: 'Group', source_path: '/Maps/Group.SC2Map' }]
        : entries.map((item) => ({ name: item.path, source_path: '/' + item.path }))
    reads = 0
    vi.mocked(keyPath).mockClear()
    const result = buildPreview(source(entries), 'package.json', pkg(maps), false)
    expect(result.fileCount).toBe(count)
    expect(result.bytes).toBe(count * 3)
    expect(result.files[0].modifiedAt).toBe(123)
    expect(reads).toBeLessThan(count * 20)
    expect(vi.mocked(keyPath).mock.calls.length).toBeLessThan(count * 4)
  },
)

test('same source and target declarations deduplicate without dropping group members', () => {
  const item = { name: 'Group', source_path: '/Maps/Group.SC2Map' }
  const result = buildPreview(
    source([entry('Maps/Group.SC2Map/a'), entry('Maps/Group.SC2Map/b')]),
    'package.json',
    pkg([item, item]),
    false,
  )
  expect(result.files.map((file) => file.target)).toEqual([
    'Maps/Group.SC2Map/a',
    'Maps/Group.SC2Map/b',
  ])
})

test.each([false, true])('case-insensitive target and parent collisions, reverse=%s', (reverse) => {
  for (const target of ['Maps/A.SC2Map', 'Maps/A.SC2Map/child.SC2Map']) {
    const maps = [
      { name: 'a', source_path: '/Maps/a.SC2Map' },
      { name: 'b', source_path: '/Maps/b.SC2Map', target_path: '/' + target },
    ]
    if (reverse) maps.reverse()
    expect(() =>
      buildPreview(
        source([entry('Maps/a.SC2Map'), entry('Maps/b.SC2Map')]),
        'package.json',
        pkg(maps),
        false,
      ),
    ).toThrow(/Conflicting package targets|Resource file\/directory target collision/)
  }
})

test('read-only directory traversal stats each node once and preserves descriptors and metadata', async () => {
  const root = await fixture()
  const nested = join(root, 'wrapper', 'Maps', 'Group.SC2Map', 'deep')
  await mkdir(nested, { recursive: true })
  await mkdir(join(root, 'empty'))
  await mkdir(join(root, 'metadata.txt'))
  await writeFile(join(root, 'wrapper', 'package.json'), '{}')
  const count = 80
  await Promise.all(Array.from({ length: count }, (_, i) => writeFile(join(nested, `${i}`), 'abc')))
  vi.mocked(lstat).mockClear()
  vi.mocked(realpath).mockClear()
  const result = await openSource({ kind: 'directory', path: root })
  const nodes = 1 + result.entries.length + result.directories!.length
  expect(vi.mocked(lstat).mock.calls).toHaveLength(nodes)
  expect(vi.mocked(realpath).mock.calls.length).toBeLessThanOrEqual(nodes + 1)
  expect(result.descriptorPaths).toEqual(['metadata.txt', 'wrapper/package.json'])
  expect(result.directories).toContain('empty')
  expect(result.tree.bytes).toBe(count * 3 + 2)
  expect(result.entries.find((item) => item.path.endsWith('/0'))).toMatchObject({
    bytes: 3,
    modifiedAt: expect.any(Number),
    changedAt: expect.any(Number),
  })
  expect(await result.read('wrapper/package.json')).toEqual(Buffer.from('{}'))

  vi.mocked(lstat).mockClear()
  vi.mocked(realpath).mockClear()
  const state = await resourceState(root)
  expect(state?.bytes).toBe(count * 3 + 2)
  expect(state?.directory).toBe(true)
  expect(vi.mocked(lstat).mock.calls).toHaveLength(nodes)
  expect(vi.mocked(realpath).mock.calls.length).toBeLessThanOrEqual(nodes + 1)
})

test('resource digest retains ordered paths, empty directories, and content', async () => {
  const root = await fixture()
  await mkdir(join(root, 'empty'))
  await writeFile(join(root, 'a'), 'abc')
  const digest = createHash('sha256')
    .update(JSON.stringify(['', 'directory']))
    .update(JSON.stringify(['a', 'file']))
    .update(createHash('sha256').update('abc').digest('hex'))
    .update(JSON.stringify(['empty', 'directory']))
    .digest('hex')
  expect(await resourceState(root)).toMatchObject({ hash: digest, bytes: 3, directory: true })
  expect(await resourceState(join(root, 'missing'))).toBeNull()
})

test.each(['inside', 'outside', 'root'] as const)(
  'read-only walks reject %s directory links/junctions',
  async (kind) => {
    const root = await fixture()
    const target = join(root, 'target')
    const tree = join(root, 'tree')
    await mkdir(target)
    await mkdir(tree)
    await writeFile(join(target, 'payload'), 'abc')
    const linkedTarget = kind === 'inside' ? join(tree, 'target') : target
    if (kind === 'inside') await mkdir(linkedTarget)
    const link = kind === 'root' ? join(root, 'link') : join(tree, 'link')
    await symlink(linkedTarget, link, process.platform === 'win32' ? 'junction' : 'dir')
    const path = kind === 'root' ? link : tree
    await expect(openSource({ kind: 'directory', path })).rejects.toMatchObject({
      code: ERRORS.FILESYSTEM_PATH_REJECTED.code,
    })
    await expect(resourceState(path)).rejects.toMatchObject({
      code: ERRORS.FILESYSTEM_PATH_REJECTED.code,
    })
  },
)

test('walk rejects canonical paths outside the root even when lstat reports a regular file', async () => {
  const root = await fixture()
  const tree = join(root, 'tree')
  await mkdir(tree)
  await writeFile(join(tree, 'file'), 'abc')
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(realpath).mockImplementation(async (path) => {
    if (path === join(tree, 'file')) return root
    return actual.realpath(path)
  })
  try {
    await expect(openSource({ kind: 'directory', path: tree })).rejects.toMatchObject({
      code: ERRORS.FILESYSTEM_PATH_REJECTED.code,
    })
    await expect(resourceState(tree)).rejects.toMatchObject({
      code: ERRORS.FILESYSTEM_PATH_REJECTED.code,
    })
  } finally {
    vi.mocked(realpath).mockImplementation(actual.realpath)
  }
})

test('source reads and writes do not reuse traversal validation after a directory is replaced', async () => {
  const root = await fixture()
  const tree = join(root, 'tree')
  const target = join(root, 'target')
  await mkdir(join(tree, 'nested'), { recursive: true })
  await mkdir(target)
  await writeFile(join(tree, 'nested', 'file'), 'original')
  await writeFile(join(target, 'file'), 'outside')
  const result = await openSource({ kind: 'directory', path: tree })
  await rm(join(tree, 'nested'), { recursive: true })
  await symlink(target, join(tree, 'nested'), process.platform === 'win32' ? 'junction' : 'dir')
  await expect(result.read('nested/file')).rejects.toMatchObject({
    code: ERRORS.FILESYSTEM_PATH_REJECTED.code,
  })
  await expect(safePath(tree, 'nested/new-file')).rejects.toMatchObject({
    code: ERRORS.FILESYSTEM_PATH_REJECTED.code,
  })
})
