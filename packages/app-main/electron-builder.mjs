import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { sevenZipFileFilters, verifySevenZipTarget } from './scripts/sevenzip-platform.mjs'

const require = createRequire(import.meta.url)
const config = require('./electron-builder.json')
const builderRequire = createRequire(require.resolve('electron-builder'))
const { Arch } = builderRequire('builder-util')
const sevenZipRoot = dirname(require.resolve('7z-bin/package.json'))

export default {
  ...config,
  electronVersion: require('electron/package.json').version,
  win: { ...config.win, files: sevenZipFileFilters('win32') },
  linux: { ...config.linux, files: sevenZipFileFilters('linux') },
  mac: { ...config.mac, files: sevenZipFileFilters('darwin') },
  async beforePack(context) {
    await verifySevenZipTarget(sevenZipRoot, context.electronPlatformName, Arch[context.arch])
  },
  extraResources: [
    {
      from: join(dirname(require.resolve('regedit/package.json')), 'vbs'),
      to: 'regedit/vbs',
      filter: ['**/*'],
    },
  ],
}
