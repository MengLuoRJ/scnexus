import { join } from 'node:path'
import { UserConfig } from 'vite'

import electronVendorsCache from '../app-main/.electron-vendors.cache.json' with { type: 'json' }

const PACKAGE_ROOT = import.meta.dirname
const PROJECT_ROOT = join(PACKAGE_ROOT, '../..')

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config: UserConfig = {
  mode: process.env.MODE,
  root: PACKAGE_ROOT,
  envDir: PROJECT_ROOT,
  ssr: {
    noExternal: ['@sentry/electron'],
  },
  resolve: {
    alias: {
      '@/': join(PACKAGE_ROOT, 'src') + '/',
    },
  },
  build: {
    ssr: true,
    sourcemap: 'inline',
    target: `chrome${electronVendorsCache.chrome}`,
    outDir: 'dist',
    assetsDir: '.',
    minify: process.env.MODE !== 'development',
    lib: {
      entry: 'src/index.ts',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['electron'],
      output: {
        // Sandboxed Electron preloads use a bundled CommonJS entry.
        entryFileNames: '[name].cjs',
      },
    },
    emptyOutDir: true,
    reportCompressedSize: false,
  },
}

export default config
