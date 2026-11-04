import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { collectThirdPartyLicenses } from '../../scripts/third-party-licenses'

const root = resolve(import.meta.dirname, '../../../..')
const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

test('collects direct production dependencies once per name/version without walking transitive or development dependencies', () => {
  const { entries } = collectThirdPartyLicenses(root)
  const names = new Set<string>()
  for (const name of ['app-main', 'app-preload', 'app-renderer-v2']) {
    const pkg = JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'))
    for (const dependency of Object.keys(pkg.dependencies)) {
      if (!dependency.startsWith('@scnexus/')) names.add(dependency)
    }
  }
  const extras = [
    'Electron',
    '7-Zip binaries',
    'Tabler Icons',
    'libbz2',
    'Emscripten runtime (bzip2-wasm)',
    'Blizzard s2protocol-derived definitions',
  ]
  expect(new Set(entries.map((entry) => entry.name))).toEqual(new Set([...names, ...extras]))
  expect(new Set(entries.map((entry) => `${entry.name}@${entry.version}`)).size).toBe(
    entries.length,
  )
  expect(entries.filter((entry) => entry.name === '@sentry/electron')).toHaveLength(1)
  expect(
    entries.some((entry) => ['vite', 'vitest', 'd3-shape', '@sentry/core'].includes(entry.name)),
  ).toBe(false)
  for (const entry of entries) {
    expect(entry.license.length).toBeGreaterThan(0)
    expect(entry.text.length).toBeGreaterThan(100)
    expect(entry.source).not.toMatch(/[A-Z]:\\/)
  }
})

test('keeps exact upstream copyright and license bodies, including bundled binary restrictions', () => {
  const { entries } = collectThirdPartyLicenses(root)
  const electron = entries.find((entry) => entry.name === 'Electron')!
  expect(electron.text).toBe(
    readFileSync(join(root, 'node_modules', 'electron', 'dist', 'LICENSE'), 'utf8').trim(),
  )
  expect(electron.text).toContain('Copyright (c) 2013-2020 GitHub Inc.')
  const binary = entries.find((entry) => entry.name === '7-Zip binaries')!
  expect(binary.text).toContain('unRAR')
  expect(binary.text).toContain('Version 2.1, February 1999')
  expect(binary.text).toContain('END OF TERMS AND CONDITIONS')
  expect(entries.find((entry) => entry.name === 'Tabler Icons')!.text).toContain('Paweł Kuna')
})

test('collects the protocol source commit from the current TypeScript data and watches it', () => {
  const { entries, files } = collectThirdPartyLicenses(root)
  const protocolData = join(
    root,
    'packages',
    'replay-parser',
    'src',
    'protocols',
    'official-data.ts',
  )
  const license = join(root, 'packages', 'replay-parser', 'LICENSE.s2protocol')
  const protocol = entries.find(
    (entry) => entry.name === 'Blizzard s2protocol-derived definitions',
  )!
  expect(protocol.version).toMatch(/^[a-f0-9]{40}$/)
  expect(readFileSync(protocolData, 'utf8').split('\n')[0]).toBe(
    `// Blizzard s2protocol ${protocol.version}; MIT, see LICENSE.s2protocol.`,
  )
  expect(protocol.license).toBe('MIT')
  expect(protocol.text).toBe(readFileSync(license, 'utf8').trim())
  expect(files).toContain(protocolData)
  expect(files).toContain(license)
})

test('fails rather than silently omitting a directly used package with a missing or empty license', () => {
  const directory = mkdtempSync(join(tmpdir(), 'scnexus-licenses-'))
  directories.push(directory)
  const main = join(directory, 'packages', 'app-main')
  const dependency = join(main, 'node_modules', 'example')
  mkdirSync(dependency, { recursive: true })
  writeFileSync(join(main, 'package.json'), JSON.stringify({ dependencies: { example: '1.0.0' } }))
  writeFileSync(
    join(dependency, 'package.json'),
    JSON.stringify({ name: 'example', version: '1.0.0', license: 'MIT' }),
  )
  expect(() => collectThirdPartyLicenses(directory)).toThrow('Missing license text: example@1.0.0')
  writeFileSync(join(dependency, 'LICENSE'), '  ')
  expect(() => collectThirdPartyLicenses(directory)).toThrow('Empty license text: example@1.0.0')
})
