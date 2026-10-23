import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { sevenZipFileFilters, verifySevenZipTarget } from './scripts/sevenzip-platform.mjs'
import { renameElectronWer } from './scripts/electron-wer.mjs'

const require = createRequire(import.meta.url)
const config = require('./electron-builder.json')
const builderRequire = createRequire(require.resolve('electron-builder'))
const { Arch } = builderRequire('builder-util')
const sevenZipRoot = dirname(require.resolve('7z-bin/package.json'))

export default {
  ...config,
  electronVersion: require('electron/package.json').version,
  win: {
    ...config.win,
    files: sevenZipFileFilters('win32'),
    extraResources: [
      {
        from: join(dirname(require.resolve('regedit/package.json')), 'vbs'),
        to: 'regedit/vbs',
        filter: ['**/*'],
      },
    ],
  },
  linux: { ...config.linux, files: sevenZipFileFilters('linux') },
  mac: {
    ...config.mac,
    files: [...sevenZipFileFilters('darwin'), '!node_modules/regedit/vbs{,/**/*}'],
  },
  async beforePack(context) {
    await verifySevenZipTarget(sevenZipRoot, context.electronPlatformName, Arch[context.arch])
  },
  async afterPack(context) {
    await renameElectronWer(context)
    if (context.electronPlatformName === 'darwin') {
      await verifySevenZipTarget(
        join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
          'app.asar.unpacked',
          'node_modules',
          '7z-bin',
        ),
        'darwin',
        Arch[context.arch],
      )
    }
  },
}
