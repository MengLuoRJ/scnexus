import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readdir, mkdtemp, rm, mkdir, cp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
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
const root = dirname(dirname(require.resolve('7z-bin')))
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
      assert.deepEqual(actual.filter((file) => file.startsWith('bin/')).sort(), expected.sort())
      assert.ok(actual.includes('package.json'))
      assert.ok(actual.includes('dist/index.mjs'))
      assert.ok(actual.includes('dist/index.cjs'))
      await config.beforePack({ electronPlatformName: platform, arch: Arch[arch] })
    })
  }
}

test('unsupported targets fail instead of selecting the build host binary', async () => {
  await assert.rejects(verifySevenZipTarget(root, 'win32', 'armv7l'), /Unsupported/)
  await assert.rejects(verifySevenZipTarget(root, 'freebsd', 'x64'), /Unsupported/)
})

test('missing target resources fail before packing', async () => {
  const temporary = await mkdtemp(
    join(fileURLToPath(new URL('../../', import.meta.url)), '.sevenzip-target-test-'),
  )
  try {
    await mkdir(join(temporary, 'bin', 'win', 'x64'), { recursive: true })
    await assert.rejects(verifySevenZipTarget(temporary, 'win32', 'x64'), { code: 'ENOENT' })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('macOS phase-one artifacts are explicit unsigned arm64/x64 DMGs with Windows-only resources excluded', () => {
  assert.deepEqual(config.mac.target, [{ target: 'dmg', arch: ['arm64', 'x64'] }])
  assert.ok(config.mac.artifactName.includes('${arch}'))
  assert.equal(config.mac.identity, null)
  assert.equal(config.mac.notarize, false)
  assert.equal(config.mac.publish, null)
  assert.equal(config.extraResources, undefined)
  assert.equal(config.win.extraResources[0].to, 'regedit/vbs')
  assert.ok(config.mac.files.includes('!node_modules/regedit/vbs{,/**/*}'))
})
test('afterPack verifies the unpacked macOS helper and rejects a missing helper', async () => {
  const out = await mkdtemp(
    join(fileURLToPath(new URL('../../', import.meta.url)), '.mac-pack-test-'),
  )
  try {
    const target = join(
      out,
      'SCNexus.app',
      'Contents',
      'Resources',
      'app.asar.unpacked',
      'node_modules',
      '7z-bin',
    )
    const context = {
      appOutDir: out,
      electronPlatformName: 'darwin',
      arch: Arch.arm64,
      packager: { appInfo: { productFilename: 'SCNexus' } },
    }
    await assert.rejects(config.afterPack(context), { code: 'ENOENT' })
    await mkdir(join(target, 'bin'), { recursive: true })
    await cp(join(root, 'bin', 'mac'), join(target, 'bin', 'mac'), { recursive: true })
    await config.afterPack(context)
    await config.afterPack({ ...context, arch: Arch.x64 })
  } finally {
    await rm(out, { recursive: true, force: true })
  }
})
