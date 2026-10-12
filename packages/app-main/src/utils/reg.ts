import { app } from 'electron'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import regedit from 'regedit'

const require = createRequire(import.meta.url)
regedit.setExternalVBSLocation(
  app.isPackaged
    ? join(process.resourcesPath, 'regedit', 'vbs')
    : join(dirname(require.resolve('regedit/package.json')), 'vbs'),
)

export default regedit.promisified
