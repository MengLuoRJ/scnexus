import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'))

test('MPQ uses the internal bzip2 codec without the obsolete JavaScript decoder', async () => {
  const main = await readJson('packages/app-main/package.json')
  assert.equal(main.dependencies['@scnexus/bzip2-wasm'], 'workspace:*')
  assert.equal(main.dependencies['seek-bzip'], undefined)
  const compression = await readFile(
    new URL('packages/app-main/src/utils/mpq/compression.ts', root),
    'utf8',
  )
  assert.match(compression, /import \{ decompressBzip2 \} from '@scnexus\/bzip2-wasm'/)
  assert.doesNotMatch(compression, /seek-bzip/)
  const builder = await readJson('packages/app-main/electron-builder.json')
  assert.ok(
    builder.files.some(
      (file) => file.from === '../bzip2-wasm/LICENSE.libbz2' && file.to === 'licenses/libbz2.txt',
    ),
  )
})

test('codec rebuilds directly from retained upstream sources without a release archive', async () => {
  const { access } = await import('node:fs/promises')
  const script = await readFile(new URL('packages/bzip2-wasm/scripts/build-wasm.mjs', root), 'utf8')
  assert.match(script, /native\/bzip2-1\.0\.8\/bzlib\.c/)
  assert.doesNotMatch(script, /tar -x|\.tar\.gz/)
  await access(new URL('packages/bzip2-wasm/native/bzip2-1.0.8/bzlib.c', root))
  await access(new URL('packages/bzip2-wasm/native/bzip2-1.0.8/LICENSE', root))
  await assert.rejects(access(new URL('packages/bzip2-wasm/native/bzip2-1.0.8.tar.gz', root)), {
    code: 'ENOENT',
  })
})

test('codec has explicit root build, regeneration, typecheck and test entrypoints', async () => {
  const pkg = await readJson('package.json')
  assert.equal(pkg.scripts['build:bzip2'], 'pnpm --filter @scnexus/bzip2-wasm build')
  assert.equal(pkg.scripts['build:bzip2:wasm'], 'pnpm --filter @scnexus/bzip2-wasm build:wasm')
  assert.match(pkg.scripts.test, /test:bzip2/)
  assert.match(pkg.scripts.typecheck, /typecheck:bzip2/)
  const codec = await readJson('packages/bzip2-wasm/package.json')
  assert.equal(codec.private, true)
  assert.ok(!codec.dependencies || Object.keys(codec.dependencies).length === 0)
})
