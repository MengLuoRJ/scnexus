import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink, link, readdir } from 'node:fs/promises'
import { join } from 'node:path'
vi.mock('electron', () => ({
  app: { isPackaged: false },
  nativeImage: {
    createFromBuffer: (buffer: Buffer) => ({
      isEmpty: () => !buffer.toString().includes('valid'),
      getSize: () => ({ width: 10, height: 10 }),
      toPNG: () => Buffer.from('decoded image'),
    }),
  },
}))
import { ContentService } from '../content-package'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import { attachmentCandidates, attachmentPath, attachmentName, matchesAsset } from '../attachments'
import { openSource } from '../source'
import type { ContentStore, CampaignActiveStoreData } from '@scnexus/app-shared/types/content.type'
const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
function index<T>(value: T) {
  return {
    getSnapshot: () => structuredClone(value),
    update: (next: T) => (value = structuredClone(next)),
  }
}
async function fixture(
  type = 'customize',
  extra: object = {},
  files: Record<string, string | Buffer> = {},
  archive = false,
  ccm = false,
  components = false,
) {
  const root = await mkdtemp(join(process.cwd(), '.attachments-test-'))
  roots.push(root)
  const game = join(root, 'game')
  const source = join(root, 'source')
  await mkdir(game)
  await mkdir(source)
  await writeFile(join(game, 'StarCraft II.exe'), 'stub')
  const manifest = {
    name: 'Example',
    description: '',
    author: 'Test',
    version: '1',
    type,
    ...(type === 'campaign' ? { campaign: 'WOL' } : {}),
    ...(type === 'dependency'
      ? { mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod' }] }
      : type === 'customize'
        ? {
            maps: [
              {
                name: 'Main.SC2Map',
                source_path: '/Maps/Main.SC2Map',
                ...(components ? { components: true } : {}),
              },
            ],
          }
        : {}),
    ...extra,
  }
  const inputs = {
    'Nested/package.json': JSON.stringify(manifest),
    ...(type === 'campaign'
      ? { 'Nested/Maps/Campaign/Main.SC2Map': 'map' }
      : type === 'dependency'
        ? { 'Nested/Mods/Core.SC2Mod': 'mod' }
        : {
            [components ? 'Nested/Maps/Main.SC2Map/MapInfo' : 'Nested/Maps/Main.SC2Map']: 'map',
          }),
    ...files,
  }
  for (const [path, data] of Object.entries(inputs)) {
    await mkdir(join(source, path, '..'), { recursive: true })
    await writeFile(join(source, path), data)
  }
  const empty: ContentStore = {
    _schemaVersion: 2,
    _revision: 0,
    records: [],
    legacyRecords: [],
    scannedAt: null,
  }
  const campaign = index(empty),
    customize = index(empty),
    dependency = index(empty)
  const active = index<CampaignActiveStoreData>({
    _schemaVersion: 2,
    _revision: 0,
    active: {},
    legacyRecords: [],
    scannedAt: null,
  })
  const paths = gamePaths(game, join(root, 'documents'))
  const service = new ContentService(
    async () => paths,
    campaign,
    customize,
    active,
    async (run) => run(),
    dependency,
  )
  if (ccm) {
    await rm(join(source, 'Nested/package.json'))
    await writeFile(
      join(source, 'Nested/metadata.txt'),
      'title=Example\ndesc=d\nauthor=A\nversion=1\ncampaign=WOL',
    )
    await writeFile(join(source, 'Nested/Main.SC2Map'), 'map')
  }
  let input = { kind: 'directory' as 'directory' | 'archive', path: source }
  if (archive) {
    const { sevenZip } = await import('../../../utils/7zip-wrapper')
    const path = join(root, 'package.zip')
    await sevenZip.add(path, await readdir(source), { cwd: source, archiveType: 'zip' })
    input = { kind: 'archive', path }
  }
  const analysis = await service.analyze(type as 'customize', input)
  expect(analysis.modes[ccm ? 'ccm' : 'scnexus']).not.toBeNull()
  const record = await service.install({
    analysisId: analysis.analysisId,
    mode: ccm ? 'ccm' : 'scnexus',
    decisions: [],
  })
  return { service, record, source, root, campaign, customize, paths }
}
const png = (text: string) =>
  Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from(text)])
test('exact sibling probes skip corrupt image; retained package-only references survive source deletion, scan and uninstall', async () => {
  const f = await fixture(
    'customize',
    { assets: ['Nested/docs/**'] },
    {
      'Nested/cover.jpg': 'invalid',
      'Nested/cover.png': png('valid'),
      'Nested/COVER.webp': png('valid'),
      'Nested/README.txt': 'first',
      'Nested/README.md': 'second',
      'Nested/CHANGELOG.md': 'changes',
      'Nested/docs/guide.md': '# Guide',
      'Nested/docs/picture.png': png('valid'),
    },
  )
  const expected = {
    image: 'Nested/cover.png',
    readme: 'Nested/README.txt',
    changelog: 'Nested/CHANGELOG.md',
    docs: [],
  }
  await rm(f.source, { recursive: true })
  expect(await f.service.assets(f.record.localId)).toEqual(expected)
  expect(await f.service.asset(f.record.localId, 'Nested/docs/guide.md')).toEqual({
    path: 'Nested/docs/guide.md',
    mime: 'text/markdown',
    data: '# Guide',
  })
  expect(await f.service.asset(f.record.localId, 'Nested/docs/picture.png')).toEqual({
    path: 'Nested/docs/picture.png',
    mime: 'image/png',
    data: Buffer.from('decoded image').toString('base64'),
  })
  await f.service.scan()
  expect(await f.service.assets(f.record.localId)).toEqual(expected)
  for (const path of [
    '../package.json',
    'https://host/a.md',
    '/Nested/README.txt',
    'Nested/package.json',
    'Nested/README.TXT',
  ])
    expect(await f.service.asset(f.record.localId, path)).toBeNull()
  const removal = await f.service.prepareRemoval(f.record.localId, 'uninstall')
  await f.service.remove(removal.removalId, [])
  await expect(f.service.assets(f.record.localId)).rejects.toMatchObject({
    name: 'IPC-INVALID-ARGUMENT',
  })
})
test.each(['campaign', 'customize', 'dependency'])(
  'explicit invalid and archive-root-relative paths for %s',
  async (type) => {
    const f = await fixture(
      type,
      {
        ...(type === 'campaign'
          ? { banner: 'missing.png' }
          : type === 'customize'
            ? { cover: 'missing.png' }
            : {}),
        readme: 'docs/README.md',
        changelog: 'missing.md',
        docs: ['docs/README.md', '../secret.md', 'missing.md'],
      },
      {
        'Nested/banner.png': png('valid'),
        'Nested/cover.png': png('valid'),
        'Nested/README.md': 'no fallback',
        'Nested/CHANGELOG.md': 'no fallback',
        'docs/README.md': 'explicit document',
      },
    )
    expect(await f.service.assets(f.record.localId)).toEqual({
      image: null,
      readme: 'docs/README.md',
      changelog: null,
      docs: ['docs/README.md'],
    })
  },
)
test('private storage rejects symlinks and hardlinks and ignores poisoned stored paths', async () => {
  const f = await fixture('customize', {}, { 'Nested/README.md': 'hello' })
  const storage = join(f.record.managementDirectory, '.attachments')
  const files = await import('node:fs/promises').then((fs) => fs.readdir(storage))
  const target = join(storage, files[0]!)
  const outside = join(f.root, 'outside.md')
  await writeFile(outside, 'secret')
  await rm(target)
  await link(outside, target)
  expect(await f.service.asset(f.record.localId, 'Nested/README.md')).toBeNull()
  await rm(target)
  await symlink(outside, target)
  expect(await f.service.asset(f.record.localId, 'Nested/README.md')).toBeNull()
})
test('selection bounds file size and total bytes and does not accept active content types', async () => {
  const f = await fixture()
  const source = await openSource({ kind: 'directory', path: f.source })
  source.entries = Array.from({ length: 100 }, (_, index) => ({
    path: `${index}.png`,
    bytes: 8 * 1024 * 1024,
    modifiedAt: null,
  }))
  source.entries.push({ path: 'too-big.md', bytes: 1024 * 1024 + 1, modifiedAt: null })
  expect(
    attachmentCandidates(source, {
      package: { ...f.record.package, assets: ['**'] },
      descriptorPath: 'Nested/package.json',
      rootRelativePath: 'Nested',
    } as import('@scnexus/app-shared/types/content.type').InstallPreview),
  ).toHaveLength(8)
  expect(
    ['a/../x.md', 'C:/x.md', '//host/x.md', 'a\\x.md', 'a/CON.md', 'x.md '].some(attachmentPath),
  ).toBe(false)
})

test.each([false, true])('archive attachments persist with source removed; CCM=%s', async (ccm) => {
  const f = await fixture(
    'campaign',
    { assets: ['Nested/docs/**'] },
    {
      'Nested/README.md': '# Archive\n[Guide](docs/guide.md)\n![Image](docs/picture.png)',
      'Nested/banner.png': png('valid'),
      'Nested/CHANGELOG.md': '# Changes',
      'Nested/docs/guide.md': '# Guide',
      'Nested/docs/picture.png': png('valid'),
    },
    true,
    ccm,
  )
  await rm(f.source, { recursive: true })
  await rm(join(f.root, 'package.zip'))
  const expected = {
    image: 'Nested/banner.png',
    readme: 'Nested/README.md',
    changelog: 'Nested/CHANGELOG.md',
    docs: [],
  }
  for (const path of ['Nested/docs/guide.md', 'Nested/docs/picture.png'])
    expect((await f.service.asset(f.record.localId, path)) !== null).toBe(!ccm)
  expect(await f.service.assets(f.record.localId)).toEqual(expected)
  await f.service.scan()
  expect(await f.service.assets(f.record.localId)).toEqual(expected)
  const removal = await f.service.prepareRemoval(f.record.localId, 'uninstall')
  await f.service.remove(removal.removalId, [])
  await expect(
    import('node:fs/promises').then((fs) => fs.stat(f.record.managementDirectory)),
  ).rejects.toMatchObject({ code: 'ENOENT' })
})

test('explicit corrupt image disables sibling probes; uppercase defaults do not match', async () => {
  const f = await fixture(
    'customize',
    { cover: 'bad.png' },
    {
      'bad.png': png('broken'),
      'Nested/cover.png': png('valid'),
      'Nested/Readme.md': 'wrong case',
      'Nested/CHANGELOG.txt': Buffer.from([255, 255]),
      'Nested/changelog.md': 'valid text',
    },
  )
  expect(await f.service.assets(f.record.localId)).toEqual({
    image: null,
    readme: null,
    changelog: 'Nested/changelog.md',
    docs: [],
  })
  expect(await f.service.asset(f.record.localId, 'bad.png')).toBeNull()
  expect(await f.service.asset(f.record.localId, 'Nested/CHANGELOG.txt')).toBeNull()
})

test('pre-existing scanned CCM uses only its validated management root, never original source', async () => {
  const f = await fixture('campaign')
  const directory = join(f.paths.ccmRoot, 'Existing')
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'metadata.txt'),
    'title=Existing\ndesc=d\nauthor=A\nversion=1\ncampaign=WOL',
  )
  await writeFile(join(directory, 'Main.SC2Map'), 'map')
  await writeFile(join(directory, 'README.md'), '# Existing')
  await writeFile(join(directory, 'banner.png'), png('valid'))
  await f.service.scan()
  const record = f.campaign
    .getSnapshot()
    .records.find((record) => record.package.name === 'Existing')!
  expect(record.attachments).toBeUndefined()
  expect(await f.service.assets(record.localId)).toEqual({
    image: 'banner.png',
    readme: 'README.md',
    changelog: null,
    docs: [],
  })
  expect(await f.service.asset(record.localId, 'README.md')).toEqual({
    path: 'README.md',
    mime: 'text/markdown',
    data: '# Existing',
  })
  expect(await f.service.asset(record.localId, '../README.md')).toBeNull()
  const outside = join(f.root, 'secret.md')
  await writeFile(outside, 'secret')
  await symlink(outside, join(directory, 'secret.md'))
  expect(await f.service.asset(record.localId, 'secret.md')).toBeNull()
})
test('pre-existing installed package reads descriptor-sibling attachments without trusting source', async () => {
  const f = await fixture('customize')
  const old = f.customize.getSnapshot()
  const record = old.records[0]!
  delete record.attachments
  record.source = { kind: 'directory', path: f.root }
  f.customize.update(old)
  await writeFile(join(f.root, 'secret.md'), 'secret')
  await writeFile(join(record.managementDirectory, 'README.md'), '# Installed')
  await writeFile(join(record.managementDirectory, 'cover.png'), png('valid'))
  expect(await f.service.assets(record.localId)).toEqual({
    image: 'cover.png',
    readme: 'README.md',
    changelog: null,
    docs: [],
  })
  expect(await f.service.asset(record.localId, 'secret.md')).toBeNull()
})

test.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])(
  'primary attachments outrank unrelated files within retention bounds; ZIP=%s explicit=%s',
  async (archive, explicit) => {
    const prefix = explicit ? 'z/' : 'Nested/'
    const files: Record<string, string | Buffer> = Object.fromEntries(
      Array.from({ length: 256 }, (_, index) => [
        `A/${String(index).padStart(3, '0')}.txt`,
        'unrelated',
      ]),
    )
    Object.assign(files, {
      [prefix + 'cover.png']: png('valid'),
      [prefix + 'README.md']: '# Readme\n[Guide](guide.md)\n![Picture](picture.png)',
      [prefix + 'CHANGELOG.md']: '# Changes',
      [prefix + 'guide.md']: '# Guide',
      [prefix + 'picture.png']: png('valid'),
    })
    const f = await fixture(
      'customize',
      {
        ...(explicit
          ? {
              cover: prefix + 'cover.png',
              readme: prefix + 'README.md',
              changelog: prefix + 'CHANGELOG.md',
            }
          : {}),
        docs: [prefix + 'guide.md'],
        assets: [prefix + 'picture.png'],
      },
      files,
      archive,
      false,
      true,
    )
    await rm(f.source, { recursive: true })
    if (archive) await rm(join(f.root, 'package.zip'))
    expect(await f.service.assets(f.record.localId)).toEqual({
      image: prefix + 'cover.png',
      readme: prefix + 'README.md',
      changelog: prefix + 'CHANGELOG.md',
      docs: [prefix + 'guide.md'],
    })
    expect(f.record.attachments!.files.length).toBeLessThanOrEqual(256)
  },
)

test.each([
  ['campaign', false, false],
  ['campaign', true, false],
  ['customize', false, false],
  ['customize', false, true],
  ['customize', true, true],
  ['customize', true, false],
] as const)(
  'all attachments survive install/scan/source deletion: type=%s ZIP=%s components=%s',
  async (type, archive, components) => {
    const explicit = components
    const f = await fixture(
      type,
      explicit
        ? {
            cover: 'assets/cover.png',
            readme: 'assets/README.md',
            changelog: 'assets/CHANGELOG.md',
            docs: ['assets/guide.md'],
            assets: ['assets/picture.png'],
          }
        : { docs: ['Nested/docs/guide.md'], assets: ['Nested/docs/picture.png'] },
      explicit
        ? {
            'assets/cover.png': png('valid'),
            'assets/README.md': '# Readme\n[Guide](guide.md)\n![Picture](picture.png)',
            'assets/CHANGELOG.md': '# Changes',
            'assets/guide.md': '# Guide',
            'assets/picture.png': png('valid'),
            'Nested/Maps/Main.SC2Map/internal.md': '# Map internals',
          }
        : {
            [`Nested/${type === 'campaign' ? 'banner' : 'cover'}.png`]: png('valid'),
            'Nested/README.md': '# Readme\n[Guide](docs/guide.md)\n![Picture](docs/picture.png)',
            'Nested/CHANGELOG.md': '# Changes',
            'Nested/docs/guide.md': '# Guide',
            'Nested/docs/picture.png': png('valid'),
          },
      archive,
      false,
      components,
    )
    await rm(f.source, { recursive: true })
    if (archive) await rm(join(f.root, 'package.zip'))
    const prefix = explicit ? 'assets/' : 'Nested/'
    const expected = {
      image: prefix + (type === 'campaign' ? 'banner.png' : 'cover.png'),
      readme: prefix + 'README.md',
      changelog: prefix + 'CHANGELOG.md',
      docs: [prefix + (explicit ? 'guide.md' : 'docs/guide.md')],
    }
    expect(await f.service.assets(f.record.localId)).toEqual(expected)
    const picture = prefix + (explicit ? 'picture.png' : 'docs/picture.png')
    for (const path of [expected.readme, expected.changelog, ...expected.docs, picture])
      expect(await f.service.asset(f.record.localId, path)).not.toBeNull()
    expect(
      await f.service.asset(f.record.localId, 'Nested/Maps/Main.SC2Map/internal.md'),
    ).toBeNull()
    await f.service.scan()
    expect(await f.service.assets(f.record.localId)).toEqual(expected)
    expect(await f.service.asset(f.record.localId, picture)).not.toBeNull()
  },
)

test.each([
  ['guide.md', '**/*.md', true],
  ['docs/guide.md', '**/*.md', true],
  ['docs/a/b/guide.md', 'docs/**/*.md', true],
  ['docs/guide.md', 'docs/**/*.md', true],
  ['docs/a.md', 'docs/*.md', true],
  ['docs/a/b.md', 'docs/*.md', false],
  ['Docs/a.md', 'docs/**', false],
  ['a.md', '*.md', true],
  ['docs/a.md', '*.md', false],
  ['a.md', '**', true],
  ['docs/a.md', 'docs/**', true],
  ['docs/a.md', 'docs/***.md', false],
  ['a.md', '?.md', false],
  ['a.md', '{a,b}.md', false],
  ['a.md', '!a.md', false],
  ['a.md', '[a].md', false],
  ['../a.md', '**', false],
  ['a.md', '../**', false],
  ['a.md', '/**', false],
  ['a.md', 'C:/**', false],
  ['a.md', '**/../a.md', false],
])('asset pattern %s against %s = %s', (path, pattern, expected) => {
  expect(matchesAsset(path, pattern)).toBe(expected)
})

test.each([false, true])(
  'strict allowlist persists only declared additions; ZIP=%s',
  async (archive) => {
    const f = await fixture(
      'customize',
      {
        docs: ['root-guide.md'],
        assets: ['**/allowed*.png', 'Nested/docs/*.md', 'executable.exe', '../secret.md'],
      },
      {
        'Nested/README.md': '![allowed](../allowed.png) [denied](private.md)',
        'allowed.png': png('valid'),
        'Nested/docs/allowed.png': png('valid'),
        'Nested/docs/guide.md': '# Guide',
        'Nested/docs/deep/private.md': 'secret',
        'Nested/docs/private.png': png('valid'),
        'Nested/docs/Allowed.png': png('valid'),
        'root-guide.md': '# Root',
        'executable.exe': 'MZ executable',
      },
      archive,
    )
    expect(f.record.attachments!.files.sort()).toEqual(
      [
        'Nested/README.md',
        'Nested/docs/allowed.png',
        'Nested/docs/guide.md',
        'allowed.png',
        'root-guide.md',
      ].sort(),
    )
    for (const path of [
      'Nested/docs/deep/private.md',
      'Nested/docs/private.png',
      'Nested/docs/Allowed.png',
      'executable.exe',
    ])
      expect(await f.service.asset(f.record.localId, path)).toBeNull()
    for (const path of [
      'allowed.png',
      'Nested/docs/allowed.png',
      'Nested/docs/guide.md',
      'root-guide.md',
    ])
      expect(await f.service.asset(f.record.localId, path)).not.toBeNull()
  },
)

test.each([undefined, []])(
  'missing/empty assets denies old retained and lazy files: %s',
  async (assets) => {
    const f = await fixture(
      'customize',
      { assets, cover: 'bad.png', readme: 'missing.md' },
      {
        'Nested/CHANGELOG.md': 'changes',
        'Nested/cover.png': png('valid'),
        'Nested/README.md': 'no fallback',
        'Nested/private.md': 'secret',
      },
    )
    expect(f.record.attachments!.files).toEqual(['Nested/CHANGELOG.md'])
    const state = f.customize.getSnapshot()
    const record = state.records[0]!
    record.attachments!.index.docs = ['Nested/private.md']
    for (const path of ['Nested/private.md', 'Nested/README.md', 'Nested/cover.png']) {
      record.attachments!.files.push(path)
      await writeFile(
        join(record.managementDirectory, '.attachments', attachmentName(path)),
        path.endsWith('.png') ? png('valid') : 'secret',
      )
    }
    f.customize.update(state)
    for (const path of ['Nested/private.md', 'Nested/README.md', 'Nested/cover.png'])
      expect(await f.service.asset(record.localId, path)).toBeNull()
    expect(await f.service.asset(record.localId, 'Nested/CHANGELOG.md')).not.toBeNull()
    expect((await f.service.assets(record.localId)).docs).toEqual([])
    delete record.attachments
    await writeFile(join(record.managementDirectory, 'private.md'), 'secret')
    await writeFile(join(record.managementDirectory, 'README.md'), 'no fallback')
    await writeFile(join(record.managementDirectory, 'cover.png'), png('valid'))
    await writeFile(join(record.managementDirectory, 'CHANGELOG.md'), 'changes')
    f.customize.update(state)
    for (const path of ['private.md', 'README.md', 'cover.png'])
      expect(await f.service.asset(record.localId, path)).toBeNull()
    expect(await f.service.assets(record.localId)).toEqual({
      image: null,
      readme: null,
      changelog: 'CHANGELOG.md',
      docs: [],
    })
  },
)

test('legacy lazy attachment allowlist is archive-root-relative, exact case, and rechecked', async () => {
  const f = await fixture('customize', { assets: ['**/allowed.md', 'images/*.png'] })
  const state = f.customize.getSnapshot()
  const record = state.records[0]!
  delete record.attachments
  await mkdir(join(record.managementDirectory, 'images'))
  await mkdir(join(record.managementDirectory, 'docs'))
  for (const path of ['allowed.md', 'docs/allowed.md', 'docs/Allowed.md', 'docs/private.md'])
    await writeFile(join(record.managementDirectory, path), '# Text')
  await writeFile(join(record.managementDirectory, 'images/picture.png'), png('valid'))
  f.customize.update(state)
  for (const path of ['allowed.md', 'docs/allowed.md', 'images/picture.png'])
    expect(await f.service.asset(record.localId, path)).not.toBeNull()
  for (const path of ['docs/Allowed.md', 'docs/private.md', '../allowed.md'])
    expect(await f.service.asset(record.localId, path)).toBeNull()
  record.package.assets = []
  f.customize.update(state)
  for (const path of ['allowed.md', 'docs/allowed.md', 'images/picture.png'])
    expect(await f.service.asset(record.localId, path)).toBeNull()
})
