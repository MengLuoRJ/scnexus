/**
 * This script should be run in electron context
 * @example
 *  ELECTRON_RUN_AS_NODE=1 electron scripts/update-electron-vendors.js
 */

import { existsSync, writeFileSync } from 'fs'
import path from 'path'

const electronRelease = process.versions

const node = electronRelease.node.split('.')[0]
const chrome = electronRelease.v8.split('.').splice(0, 2).join('')

const browserslistrcPath = path.resolve(process.cwd(), '.browserslistrc')

if (existsSync('./packages/app-main')) {
  writeFileSync(
    './packages/app-main/.electron-vendors.cache.json',
    JSON.stringify({ chrome, node }),
  )
}

if (existsSync('./packages/app-renderer')) {
  writeFileSync('./packages/app-renderer/.browserslistrc', `Chrome ${chrome}`, 'utf8')
}

if (existsSync('./packages/app-renderer-v2')) {
  writeFileSync('./packages/app-renderer-v2/.browserslistrc', `Chrome ${chrome}`, 'utf8')
}

writeFileSync(browserslistrcPath, `Chrome ${chrome}`, 'utf8')
