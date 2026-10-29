import { beforeAll, test } from 'vitest'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import { createGenerator } from 'ts-json-schema-generator'
import * as api from '../src/package/index.ts'

const { isPackage } = api
let validate

beforeAll(() => {
  const schema = createGenerator({
    path: fileURLToPath(new URL('../src/package/package.type.ts', import.meta.url)),
    tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
    type: 'Package',
    expose: 'export',
    jsDoc: 'extended',
    additionalProperties: false,
  }).createSchema('Package')
  validate = new Ajv({ strict: true }).compile(schema)
})

test('correct launcher and official bank fields are validated', () => {
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

test('dependency packages accept only the SCNexus mod-only contract', () => {
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

test('presentation paths are declarations only with type-specific images and common documentation', () => {
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

test('specialized guards validate the entire package and only match their own kind', () => {
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
