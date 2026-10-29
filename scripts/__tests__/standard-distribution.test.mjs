import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const standard = new URL('../../packages/standard/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', standard), 'utf8'))
const subpaths = ['package']

test('standard exports only ESM subpaths with matching declaration mappings', () => {
  assert.equal(manifest.type, 'module')
  assert.deepEqual(manifest.files, ['dist'])
  assert.deepEqual(
    Object.keys(manifest.exports).sort(),
    ['./package.schema.json', ...subpaths.map((name) => `./${name}`)].sort(),
  )
  assert.deepEqual(Object.keys(manifest.typesVersions['*']).sort(), subpaths)
  assert.equal(manifest.main, undefined)
  for (const name of subpaths) {
    assert.deepEqual(manifest.exports[`./${name}`], {
      import: {
        types: `./dist/${name}/index.d.ts`,
        default: `./dist/${name}/index.js`,
      },
    })
    assert.deepEqual(manifest.typesVersions['*'][name], [`./dist/${name}/index.d.ts`])
  }
})

test('standard build removes legacy artifacts and emits no CommonJS', async () => {
  const dist = new URL('dist/', standard)
  const relativeFiles = (await readdir(dist, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(fileURLToPath(dist), join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
    )
  assert.deepEqual(
    relativeFiles.sort(),
    [
      'package.schema.json',
      ...subpaths.flatMap((name) =>
        ['index.d.ts', 'index.js', 'index.js.map'].map((file) => `${name}/${file}`),
      ),
    ].sort(),
    'Build standard first; stale CJS and legacy declaration files must not remain',
  )
  for (const name of subpaths) {
    const code = await readFile(new URL(`dist/${name}/index.js`, standard), 'utf8')
    assert.doesNotMatch(code, /\brequire\s*\(|\bmodule\.exports\b|\bexports\./)
  }
})

test('package subpath supports native ESM imports and rejects require', () => {
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
    import assert from 'node:assert/strict'
    import { isPackage } from '@scnexus/standard/package'
    assert.equal(typeof isPackage, 'function')
  `,
    ],
    { cwd: fileURLToPath(standard), stdio: 'pipe' },
  )
  const require = createRequire(new URL('package.json', standard))
  assert.throws(() => require.resolve('@scnexus/standard/metadata'), {
    code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  })
  for (const name of [...subpaths, 'metadata']) {
    assert.throws(() => require(`@scnexus/standard/${name}`), {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    })
  }
})

test('standard declarations resolve for NodeNext, Bundler and legacy TypeScript consumers', () => {
  const require = createRequire(import.meta.url)
  const ts = require('typescript')
  const containingFile = fileURLToPath(new URL('src/distribution-consumer.ts', standard))
  for (const moduleResolution of [
    ts.ModuleResolutionKind.NodeNext,
    ts.ModuleResolutionKind.Bundler,
    ts.ModuleResolutionKind.Node10,
  ]) {
    for (const name of subpaths) {
      const { resolvedModule } = ts.resolveModuleName(
        `@scnexus/standard/${name}`,
        containingFile,
        { moduleResolution },
        ts.sys,
        undefined,
        undefined,
        ts.ModuleKind.ESNext,
      )
      assert.equal(
        resolvedModule?.resolvedFileName.replaceAll('\\', '/'),
        fileURLToPath(new URL(`dist/${name}/index.d.ts`, standard)).replaceAll('\\', '/'),
      )
    }
  }
})

test('correct launcher and official bank fields are validated', async () => {
  const { isPackage } = await import(new URL('dist/package/index.js', standard))
  const manifest = {
    type: 'customize',
    name: 'Example',
    description: '',
    version: '1.0.0',
    author: 'Author',
    maps: [{ name: 'Entry.SC2Map', source_path: '/Maps/Entry.SC2Map' }],
    launcher: { name: 'Entry.SC2Map' },
    bank_enable: 'official',
  }
  assert.equal(isPackage(manifest), true)
  assert.equal(isPackage({ ...manifest, launcher: { name: 123 } }), false)
  assert.equal(isPackage({ ...manifest, bank_enable: 'custom' }), true)
  assert.equal(isPackage({ ...manifest, bank_enable: 'offcial' }), false)
})

test('dependency packages accept only the SCNexus mod-only contract', async () => {
  const { isPackage } = await import(new URL('dist/package/index.js', standard))
  const dependency = {
    type: 'dependency',
    scnid: 12,
    name: 'Shared mod',
    description: 'Dependency',
    tags: ['mod'],
    version: '1.0.0',
    author: 'Author',
    mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod', components: true }],
  }
  assert.equal(isPackage(dependency), true)
  assert.equal(
    isPackage({
      ...dependency,
      website: 'https://example.com',
      social: { discord: 'community' },
      sponsor: { afdian: 'support' },
    }),
    true,
  )
  for (const change of [
    { website: 123 },
    { social: { discord: false } },
    { sponsor: { afdian: null } },
  ])
    assert.equal(isPackage({ ...dependency, ...change }), false)
  for (const field of [
    'manager',
    'maps',
    'campaign',
    'localization',
    'dependencies',
    'launcher',
    'bank_enable',
    'banks',
    'descriotion',
    'unknown',
  ])
    assert.equal(isPackage({ ...dependency, [field]: null }), false, field)
  assert.equal(
    isPackage({ ...dependency, mods: [{ name: 'Bad.SC2Map', source_path: '/Maps/Bad.SC2Map' }] }),
    false,
  )
  assert.equal(isPackage({ ...dependency, type: 'unknown' }), false)
  assert.equal(isPackage({ ...dependency, scnid: -1 }), false)
  for (const type of ['campaign', 'customize']) {
    assert.equal(
      isPackage({
        ...dependency,
        type,
        campaign: 'WOL',
        website: 'https://example.com',
        social: { discord: 'community' },
        sponsor: { afdian: 'support' },
      }),
      true,
    )
  }
})
test('named package types expose a discriminated dependency contract', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
  const folder = await mkdtemp(join(fileURLToPath(standard), '.types-test-'))
  try {
    const file = join(folder, 'consumer.mts')
    await writeFile(
      file,
      `
import { isPackageCampaign, isPackageCustomize, isPackageDependency } from '../dist/package/index.js'
import type { Package, PackageContent, PackageDependency, PackageCampaign, PackageCustomize, PackageCampaignType, PackageResource, PackageMap, PackageMod, PackageSocial, PackageSponsor, PackageDependencyReference } from '../dist/package/index.js'
const mod: PackageMod = { name: 'A.SC2Mod', source_path: '/Mods/A.SC2Mod' }
const resource: PackageResource = mod
const map: PackageMap = { name: 'A.SC2Map', source_path: '/Maps/A.SC2Map' }
const social: PackageSocial = { discord: 'community' }
const sponsor: PackageSponsor = { afdian: 'support' }
const reference: PackageDependencyReference = { scnid: 1 }
const dependency: PackageDependency = { name: 'dep', description: '', author: 'a', version: '1', type: 'dependency', mods: [mod], website: 'https://example.com', social, sponsor }
const content: PackageContent = { ...dependency, type: 'customize', maps: [map], social, sponsor, dependencies: [reference] }
const pkg: Package = dependency
const documentation = { readme: 'docs/intro.md', changelog: 'docs/changes.txt', docs: ['docs/guide.md'], assets: ['images/**'] }
const documentedDependency: PackageDependency = { ...dependency, ...documentation }
const legacyCampaign: PackageContent = { name: 'campaign', description: '', version: '1', author: 'a', type: 'campaign' }
const campaignBanner: PackageCampaign = { ...legacyCampaign, type: 'campaign', campaign: 'WOL', banner: 'images/banner.png', ...documentation }
const customizeCover: PackageCustomize = { ...content, type: 'customize', cover: 'images/cover.webp', ...documentation }
// @ts-expect-error campaigns cannot declare covers, including through spread
const invalidCampaignImage: PackageContent = { ...campaignBanner, ...{ cover: 'cover.png' } }
// @ts-expect-error customize packages cannot declare banners, including through spread
const invalidCustomizeImage: Package = { ...customizeCover, ...{ banner: 'banner.png' } }
// @ts-expect-error dependencies cannot declare banners
const invalidDependencyBanner: PackageDependency = { ...dependency, banner: 'banner.png' }
// @ts-expect-error dependencies cannot declare covers
const invalidDependencyCover: PackageDependency = { ...dependency, cover: 'cover.png' }
// @ts-expect-error docs must be a string array
const invalidDocs: PackageContent = { ...content, docs: 'docs/guide.md' }
function narrow(value: unknown) {
  if (isPackageCampaign(value)) { const campaign: PackageCampaignType = value.campaign; const pkg: PackageCampaign = value }
  if (isPackageCustomize(value)) { const pkg: PackageCustomize = value; const type: 'customize' = value.type }
  if (isPackageDependency(value)) {
    const pkg: PackageDependency = value
    // @ts-expect-error dependency guard does not expose content-only fields
    value.maps
  }
}
// @ts-expect-error dependency cannot declare an installation manager
const invalid: PackageDependency = { ...dependency, manager: 'CCM' }
// @ts-expect-error package types are closed
const invalidType: Package = { ...dependency, type: 'other' }
function read(value: Package) {
  if (value.type === 'dependency') {
    // @ts-expect-error dependency packages have no maps
    value.maps
  }
}
`,
    )
    const require = createRequire(import.meta.url)
    const ts = require('typescript')
    const program = ts.createProgram([file], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
    })
    const errors = ts.getPreEmitDiagnostics(program)
    assert.equal(
      errors.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => folder,
        getNewLine: () => '\n',
      }),
    )
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})

test('generated JSON Schema is deterministic, importable and enforces package field structure', async () => {
  const before = await readFile(new URL('dist/package.schema.json', standard), 'utf8')
  execFileSync(process.execPath, ['scripts/generate-schema.mjs'], {
    cwd: fileURLToPath(standard),
    stdio: 'pipe',
  })
  assert.equal(await readFile(new URL('dist/package.schema.json', standard), 'utf8'), before)
  const require = createRequire(new URL('package.json', standard))
  const schema = require('@scnexus/standard/package.schema.json')
  assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#')
  const Ajv = require('ajv')
  const validate = new Ajv({ strict: true }).compile(schema)
  const { isPackage } = await import(new URL('dist/package/index.js', standard))
  const base = {
    name: 'Example',
    description: '',
    version: '1.0.0',
    author: 'A',
    $schema: './package.schema.json',
  }
  for (const type of ['campaign', 'customize', 'dependency']) {
    const value = {
      ...base,
      type,
      ...(type === 'campaign' ? { campaign: 'WOL' } : {}),
      mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod' }],
      website: 'https://example.com',
      social: { discord: 'group' },
      sponsor: { afdian: 'support' },
    }
    assert.equal(validate(value), true, JSON.stringify(validate.errors))
    assert.equal(isPackage(value), true)
  }
  const dep = { ...base, type: 'dependency' }
  for (const change of [
    { maps: [] },
    { manager: 'SCNexus' },
    { unknown: true },
    { $schema: 42 },
    { scnid: -1 },
    { scnid: 0.5 },
    { scnid: Number.MAX_SAFE_INTEGER + 1 },
    { name: '   ' },
    { sponsor: { afdian: 1 } },
    { mods: [{ name: 'A.SC2Map', source_path: '/Maps/A.SC2Map' }] },
    { mods: [{ name: 'A.SC2Mod', source_path: '/Maps/A.SC2Mod' }] },
  ]) {
    assert.equal(validate({ ...dep, ...change }), false, JSON.stringify(change))
    assert.equal(isPackage({ ...dep, ...change }), false, JSON.stringify(change))
  }
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import schema from '@scnexus/standard/package.schema.json' with { type: 'json' }; if (!schema.definitions.Package) throw new Error('Missing schema definitions')`,
    ],
    { cwd: fileURLToPath(standard), stdio: 'pipe' },
  )
})

test('presentation paths are declarations only with type-specific images and common documentation', async () => {
  const api = await import(new URL('dist/package/index.js', standard))
  const require = createRequire(new URL('package.json', standard))
  const Ajv = require('ajv')
  const validate = new Ajv({ strict: true }).compile(
    require('@scnexus/standard/package.schema.json'),
  )
  const base = { name: 'Example', description: '', version: '1', author: 'A' }
  const invalidText = [null, 42, false, [], {}]
  for (const type of ['campaign', 'customize', 'dependency']) {
    const value = { ...base, type, ...(type === 'campaign' ? { campaign: 'WOL' } : {}) }
    const guard = api[`isPackage${type[0].toUpperCase()}${type.slice(1)}`]
    function check(change, expected) {
      const input = { ...value, ...change }
      assert.equal(validate(input), expected, JSON.stringify(input))
      assert.equal(api.isPackage(input), expected, JSON.stringify(input))
      assert.equal(guard(input), expected, JSON.stringify(input))
    }
    check({}, true)
    check({ assets: undefined }, true)
    check({ assets: [] }, true)
    check({ assets: ['**/*.png', 'images/*', 'missing.md', '../outside'] }, true)
    for (const invalid of [null, 42, false, {}, 'image.png', [null], [1]])
      check({ assets: invalid }, false)
    assert.equal(api.isPackage({ ...value, assets: ['bad\0path'] }), false)
    check({ readme: undefined, changelog: undefined, docs: undefined }, true)
    if (type !== 'dependency')
      check({ [type === 'campaign' ? 'banner' : 'cover']: undefined }, true)
    check({ readme: 'missing/README.md', changelog: 'missing/CHANGELOG.txt', docs: [] }, true)
    check({ readme: '', changelog: '', docs: ['missing/guide.md', 'missing/other.txt'] }, true)
    // Path safety, file existence and image decoding belong to the client, not this validator.
    for (const path of [
      'missing/image.png',
      '../outside',
      'C:\\outside.txt',
      'https://example.com/a',
      '',
    ]) {
      check({ readme: path, changelog: path, docs: [path] }, true)
      if (type !== 'dependency') check({ [type === 'campaign' ? 'banner' : 'cover']: path }, true)
    }
    for (const field of ['readme', 'changelog', 'banner', 'cover']) {
      for (const invalid of invalidText) check({ [field]: invalid }, false)
      assert.equal(api.isPackage({ ...value, [field]: 'invalid\0path' }), false)
    }
    for (const invalid of [
      ...invalidText.filter((item) => !Array.isArray(item)),
      'guide.md',
      [null],
      [1],
      ['ok', false],
    ])
      check({ docs: invalid }, false)
    assert.equal(api.isPackage({ ...value, docs: ['invalid\0path'] }), false)
    if (type !== 'campaign') check({ banner: 'banner.jpg' }, false)
    if (type !== 'customize') check({ cover: 'cover.jpg' }, false)
    check({ banner: 'banner.jpg', cover: 'cover.jpg' }, false)
  }
})

test('specialized guards validate the entire package and only match their own kind', async () => {
  const api = await import(new URL('dist/package/index.js', standard))
  const guards = {
    campaign: api.isPackageCampaign,
    customize: api.isPackageCustomize,
    dependency: api.isPackageDependency,
  }
  const base = { name: 'Example', description: '', version: '1', author: 'A' }
  for (const [kind, guard] of Object.entries(guards)) {
    for (const type of Object.keys(guards)) {
      const value = { ...base, type, ...(type === 'campaign' ? { campaign: 'WOL' } : {}) }
      assert.equal(guard(value), type === kind)
      assert.equal(guard({ ...value, name: ' ' }), false)
      assert.equal(
        guard({
          ...value,
          mods: [{ name: 'Invalid.SC2Map', source_path: '/Maps/Invalid.SC2Map' }],
        }),
        false,
      )
    }
    for (const value of [null, [], {}, { type: kind }, undefined, 42])
      assert.equal(guard(value), false)
  }
  assert.equal(api.isPackageCampaign({ ...base, type: 'campaign' }), false)
  assert.equal(api.isPackageDependency({ ...base, type: 'dependency', manager: 'CCM' }), false)
})
