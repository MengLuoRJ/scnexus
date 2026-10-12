import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const config = require('./electron-builder.json')
const sentryRequire = createRequire(require.resolve('@sentry/electron/main'))
// Preserve the SDK's nested version instead of the legacy renderer's hoisted browser SDK.
const sentryBrowser = dirname(sentryRequire.resolve('@sentry/browser/package.json'))

export default {
  ...config,
  electronVersion: require('electron/package.json').version,
  files: [
    ...config.files,
    {
      from: sentryBrowser,
      to: 'node_modules/@sentry/electron/node_modules/@sentry/browser',
      filter: ['**/*'],
    },
  ],
  extraResources: [
    {
      from: join(dirname(require.resolve('regedit/package.json')), 'vbs'),
      to: 'regedit/vbs',
      filter: ['**/*'],
    },
  ],
}
