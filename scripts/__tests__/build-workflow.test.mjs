import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
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
  const preload = await json('packages/app-preload/package.json')
  assert.equal(preload.main, 'dist/index.cjs')
  const preloadConfig = await readFile(new URL('packages/app-preload/vite.config.ts', root), 'utf8')
  assert.match(preloadConfig, /formats: \['cjs'\]/)
  const window = await readFile(
    new URL('packages/app-main/src/modules/window/window.ts', root),
    'utf8',
  )
  assert.match(window, /sandbox: true/)
  assert.match(window, /'index\.cjs'/)
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
  assert.deepEqual(config.files, (await json('packages/app-main/electron-builder.json')).files)
  assert.ok(
    !config.files.some(
      (file) => typeof file === 'object' && file.to?.includes('node_modules/@sentry'),
    ),
    'Let the dependency collector preserve Sentry versions; manual copies break nested resolution',
  )
  assert.equal(
    config.extraResources[0].from,
    join(dirname(require.resolve('regedit/package.json')), 'vbs'),
  )
})

test('renderer-v2 is the only renderer package and owns the application icons', async () => {
  await assert.rejects(access(new URL('packages/app-renderer/package.json', root)), {
    code: 'ENOENT',
  })
  const lock = await readFile(new URL('pnpm-lock.yaml', root), 'utf8')
  assert.ok(!lock.includes('  packages/app-renderer:'))
  const tray = await readFile(new URL('packages/app-main/src/modules/tray/tray.ts', root), 'utf8')
  assert.ok(tray.includes("'app-renderer-v2'"))
  assert.ok(!tray.includes("'app-renderer'"))
  for (const extension of ['png', 'ico'])
    await access(new URL(`packages/app-renderer-v2/public/application_icon.${extension}`, root))
  for (const name of ['README.md', 'README.english.md']) {
    const text = await readFile(new URL(name, root), 'utf8')
    assert.ok(text.includes('./packages/app-renderer-v2/public/application_icon.png'))
  }
  const targets = await readFile(new URL('scripts/update-electron-vendors.js', root), 'utf8')
  assert.ok(!targets.includes("'./packages/app-renderer'"))
})

test('version sync targets renderer-v2 and Electron targets use Chromium rather than V8', async () => {
  const sync = await readFile(new URL('scripts/sync-app-packages-version.ts', root), 'utf8')
  assert.match(sync, /@scnexus\/app-renderer-v2/)
  assert.ok(!sync.includes("path: 'packages/app-renderer'"))
  const targets = await readFile(new URL('scripts/update-electron-vendors.js', root), 'utf8')
  assert.match(targets, /electronRelease\.chrome/)
  assert.ok(!targets.includes('electronRelease.v8'))
})
