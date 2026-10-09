#!/usr/bin/env tsx

import electronPath from 'electron'
import { build, createServer, LogLevel, ViteDevServer } from 'vite'
import { spawn, type ChildProcess } from 'node:child_process'

/** @type 'production' | 'development'' */
const mode: 'production' | 'development' = (process.env.MODE =
  (process.env.MODE as 'production' | 'development') || 'development')

/** @type {import('vite').LogLevel} */
const logLevel: LogLevel = 'warn'

/**
 * Setup watcher for `main` package
 * On file changed it totally re-launch electron app.
 * @param {import('vite').ViteDevServer} watchServer Renderer watch server instance.
 * Needs to set up `VITE_DEV_SERVER_URL` environment variable from {@link import('vite').ViteDevServer.resolvedUrls}
 */
function setupMainPackageWatcher({ resolvedUrls }: ViteDevServer) {
  process.env.VITE_DEV_SERVER_URL = resolvedUrls?.local[0]

  /** @type {ChildProcess | null} */
  let electronApp: ChildProcess | null = null

  return build({
    mode,
    logLevel,
    configFile: 'packages/app-main/vite.config.ts',
    build: {
      /**
       * Set to {} to enable rollup watcher
       * @see https://vitejs.dev/config/build-options.html#build-watch
       */
      watch: {},
    },
    plugins: [
      {
        name: 'reload-app-on-main-package-change',
        async writeBundle() {
          if (electronApp !== null) {
            const previous = electronApp
            previous.removeListener('exit', process.exit)
            if (previous.exitCode === null && previous.signalCode === null) {
              await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                  previous.removeListener('exit', stopped)
                  reject(new Error('Previous Electron process did not exit within 10 seconds'))
                }, 10_000)
                const stopped = () => {
                  clearTimeout(timeout)
                  resolve()
                }
                previous.once('exit', stopped)
                previous.kill('SIGINT')
              })
            }
            electronApp = null
          }

          /** Spawn new electron process */
          electronApp = spawn(String(electronPath), ['--inspect', '.'], {
            stdio: 'inherit',
          })

          /** Stops the watch script when the application has been quit */
          electronApp.addListener('exit', process.exit)
        },
      },
    ],
  })
}

/**
 * Setup watcher for `preload` package
 * On file changed it reload web page.
 * @param {import('vite').ViteDevServer} watchServer Renderer watch server instance.
 * Required to access the web socket of the page. By sending the `full-reload` command to the socket, it reloads the web page.
 */
async function setupPreloadPackageWatcher({ ws }: ViteDevServer) {
  let firstBuild = true
  let resolveReady: () => void
  let rejectReady: (error: unknown) => void
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  const watcher = await build({
    mode,
    logLevel,
    configFile: 'packages/app-preload/vite.config.ts',
    build: {
      /**
       * Set to {} to enable rollup watcher
       * @see https://vitejs.dev/config/build-options.html#build-watch
       */
      watch: {},
    },
    plugins: [
      {
        name: 'reload-page-on-preload-package-change',
        buildEnd(error) {
          if (firstBuild && error) rejectReady(error)
        },
        writeBundle() {
          if (firstBuild) {
            firstBuild = false
            resolveReady()
            return
          }
          ws.send({
            type: 'full-reload',
          })
        },
      },
    ],
  })
  await ready
  return watcher
}

/**
 * Dev server for Renderer package
 * This must be the first,
 * because the {@link setupMainPackageWatcher} and {@link setupPreloadPackageWatcher}
 * depend on the dev server properties
 */
const rendererWatchServer = await createServer({
  mode,
  logLevel,
  configFile: 'packages/app-renderer-v2/vite.config.ts',
}).then((s) => s.listen())

await setupPreloadPackageWatcher(rendererWatchServer)
await setupMainPackageWatcher(rendererWatchServer)
