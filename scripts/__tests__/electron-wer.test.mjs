import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../../packages/app-main/electron-builder.mjs'
import { renameElectronWer } from '../../packages/app-main/scripts/electron-wer.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
for (const projectName of ['electron', 'custom-electron']) {
  test(`Electron 45 Windows WER follows renamed executable (${projectName})`, async () => {
    const appOutDir = await mkdtemp(join(root, '.wer-test-'))
    const context = {
      appOutDir,
      electronPlatformName: 'win32',
      packager: {
        config: { electronVersion: '45.0.0', electronBranding: { projectName } },
        appInfo: { productFilename: 'SCNexus' },
      },
    }
    try {
      await writeFile(join(appOutDir, `${projectName}_wer.dll`), 'fixture')
      await config.afterPack(context)
      assert.equal(await readFile(join(appOutDir, 'SCNexus_wer.dll'), 'utf8'), 'fixture')
      await assert.rejects(access(join(appOutDir, `${projectName}_wer.dll`)), { code: 'ENOENT' })
      await assert.rejects(config.afterPack(context), { code: 'ENOENT' })
    } finally {
      await rm(appOutDir, { recursive: true, force: true })
    }
  })
}

test('WER hook leaves other platforms, old Electron and unchanged names alone', async () => {
  for (const [platform, version, name] of [
    ['linux', '45.0.0', 'SCNexus'],
    ['darwin', '45.0.0', 'SCNexus'],
    ['win32', '44.5.1', 'SCNexus'],
    ['win32', '45.0.0', 'electron'],
  ]) {
    await renameElectronWer({
      electronPlatformName: platform,
      packager: { config: { electronVersion: version }, appInfo: { productFilename: name } },
    })
  }
})
