import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readdir, mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  sevenZipFileFilters,
  verifySevenZipTarget,
} from '../../packages/app-main/scripts/sevenzip-platform.mjs'
import config from '../../packages/app-main/electron-builder.mjs'

const require = createRequire(new URL('../../packages/app-main/package.json', import.meta.url))
const builderRequire = createRequire(require.resolve('electron-builder'))
const libRequire = createRequire(builderRequire.resolve('app-builder-lib'))
const { FileMatcher } = libRequire('./fileMatcher')
const { Arch } = builderRequire('builder-util')
const root = dirname(require.resolve('7z-bin/package.json'))
async function list(directory, prefix = '') {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory())
      files.push(...(await list(join(directory, entry.name), prefix + entry.name + '/')))
    else files.push(prefix + entry.name)
  }
  return files
}

for (const [platform, folder, arches] of [
  ['win32', 'win', ['x64', 'ia32', 'arm64']],
  ['linux', 'linux', ['x64', 'ia32', 'arm64']],
  ['darwin', 'mac', ['x64', 'arm64', 'universal']],
]) {
  for (const arch of arches) {
    test(`${platform}-${arch} only includes matching binaries and the license`, async () => {
      const matcher = new FileMatcher(
        root,
        root,
        (pattern) => pattern.replaceAll('${arch}', arch),
        [
          '**/*',
          ...sevenZipFileFilters(platform).map((pattern) =>
            pattern.replace('node_modules/7z-bin/', ''),
          ),
        ],
      )
      const filter = matcher.createFilter()
      const actual = (await list(root)).filter((file) =>
        filter(join(root, file), { isDirectory: () => false }),
      )
      const expected = (
        await list(join(root, 'bin', folder, ...(platform === 'darwin' ? [] : [arch])))
      ).map((file) => `bin/${folder}/${platform === 'darwin' ? '' : arch + '/'}${file}`)
      if (platform !== 'darwin') expected.push(`bin/${folder}/License.txt`)
      assert.deepEqual(actual.filter((file) => file.startsWith('bin/')).sort(), expected.sort())
      assert.ok(actual.includes('package.json'))
      assert.ok(actual.includes('dist/index.js'))
      await config.beforePack({ electronPlatformName: platform, arch: Arch[arch] })
    })
  }
}

test('unsupported targets fail instead of selecting the build host binary', async () => {
  await assert.rejects(verifySevenZipTarget(root, 'win32', 'armv7l'), /Unsupported/)
  await assert.rejects(verifySevenZipTarget(root, 'freebsd', 'x64'), /Unsupported/)
})

test('missing target resources fail before packing', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'sevenzip-target-test-'))
  try {
    await mkdir(join(temporary, 'bin', 'win', 'x64'), { recursive: true })
    await assert.rejects(verifySevenZipTarget(temporary, 'win32', 'x64'), { code: 'ENOENT' })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
