import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const standard = new URL('../../packages/standard/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', standard), 'utf8'))
const subpaths = ['metadata', 'package']

test('standard exports only ESM subpaths with matching declaration mappings', () => {
  assert.equal(manifest.type, 'module')
  assert.deepEqual(manifest.files, ['dist'])
  assert.deepEqual(
    Object.keys(manifest.exports).sort(),
    subpaths.map((name) => `./${name}`),
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
    subpaths
      .flatMap((name) =>
        ['index.d.ts', 'index.js', 'index.js.map'].map((file) => `${name}/${file}`),
      )
      .sort(),
    'Build standard first; stale CJS and legacy declaration files must not remain',
  )
  for (const name of subpaths) {
    const code = await readFile(new URL(`dist/${name}/index.js`, standard), 'utf8')
    assert.doesNotMatch(code, /\brequire\s*\(|\bmodule\.exports\b|\bexports\./)
  }
})

test('both standard subpaths support native ESM imports and reject require', () => {
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
    import assert from 'node:assert/strict'
    import { isPackage } from '@scnexus/standard/package'
    import * as metadata from '@scnexus/standard/metadata'
    assert.equal(typeof isPackage, 'function')
    assert.equal(typeof metadata, 'object')
  `,
    ],
    { cwd: fileURLToPath(standard), stdio: 'pipe' },
  )
  const require = createRequire(new URL('package.json', standard))
  for (const name of subpaths) {
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
