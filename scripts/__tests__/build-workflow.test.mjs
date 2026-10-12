import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
const root = new URL('../../', import.meta.url)
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'))

test('root builds current runtime packages after standard and verifies their types', async () => {
  const pkg = await json('package.json')
  assert.match(
    pkg.scripts['build:app'],
    /build:app:prepare.*MODE=production.*build.*app-main build:app/,
  )
  assert.match(
    pkg.scripts.build,
    /build:prepare.*typecheck.*build:main.*build:preload.*build:renderer/,
  )
  assert.match(pkg.scripts['build:prepare'], /script:electron:targets.*build:standard/)
  assert.match(pkg.scripts['build:renderer'], /app-renderer-v2/)
  assert.match(pkg.scripts['typecheck:renderer'], /app-renderer-v2/)
  assert.match(pkg.scripts['test:renderer'], /app-renderer-v2.*--run/)
  assert.ok(!pkg.scripts['test:e2e'], 'Do not label unit-test discovery as E2E')
})

test('app-main is the sole packaging application and includes v2 and external tools', async () => {
  const pkg = await json('packages/app-main/package.json')
  const { default: config } = await import(new URL('packages/app-main/electron-builder.mjs', root))
  assert.equal(pkg.main, 'packages/app-main/dist/index.js')
  assert.match(pkg.scripts['build:app'], /electron-builder\.mjs.*--dir.*--publish never/)
  assert.match(pkg.scripts['build:app:release'], /--publish never/)
  assert.ok(!config.directories.app, 'Do not move the application directory to the workspace root')
  for (const dest of [
    'packages/app-main/dist/',
    'packages/app-preload/dist/',
    'packages/app-renderer-v2/dist/',
  ])
    assert.ok(config.files.some((file) => file.to === dest))
  assert.ok(!config.files.some((file) => file.to === 'packages/app-renderer/dist/'))
  assert.ok(config.asarUnpack.includes('node_modules/7z-bin/**'))
  const require = createRequire(new URL('packages/app-main/package.json', root))
  assert.equal(config.electronVersion, require('electron/package.json').version)
  const sentryRequire = createRequire(require.resolve('@sentry/electron/main'))
  assert.equal(
    config.files.find(
      (file) => file.to === 'node_modules/@sentry/electron/node_modules/@sentry/browser',
    ).from,
    dirname(sentryRequire.resolve('@sentry/browser/package.json')),
  )
  assert.equal(
    config.extraResources[0].from,
    join(dirname(require.resolve('regedit/package.json')), 'vbs'),
  )
})

test('version sync targets renderer-v2 and Electron targets use Chromium rather than V8', async () => {
  const sync = await readFile(new URL('scripts/sync-app-packages-version.ts', root), 'utf8')
  assert.match(sync, /@scnexus\/app-renderer-v2/)
  assert.ok(!sync.includes("path: 'packages/app-renderer'"))
  const targets = await readFile(new URL('scripts/update-electron-vendors.js', root), 'utf8')
  assert.match(targets, /electronRelease\.chrome/)
  assert.ok(!targets.includes('electronRelease.v8'))
})
