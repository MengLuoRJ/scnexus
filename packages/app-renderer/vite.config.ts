import { join } from 'node:path'
import { UserConfig } from 'vite'

import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

import { unheadVueComposablesImports } from '@unhead/vue'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import { visualizer } from 'rollup-plugin-visualizer'

import { chrome } from '../app-main/.electron-vendors.cache.json'

const PACKAGE_ROOT = __dirname
const PROJECT_ROOT = join(PACKAGE_ROOT, '../..')

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config: UserConfig = {
  mode: process.env.MODE,
  root: PACKAGE_ROOT,
  envDir: PROJECT_ROOT,
  resolve: {
    alias: {
      '@/': join(PACKAGE_ROOT, 'src') + '/',
    },
  },
  base: '',
  server: {
    fs: {
      strict: true,
    },
  },
  build: {
    sourcemap: true,
    target: `chrome${chrome}`,
    outDir: 'dist',
    assetsDir: '.',
    minify: process.env.MODE !== 'development',
    rollupOptions: {
      input: join(PACKAGE_ROOT, 'index.html'),
      output: {
        manualChunks: {
          vuei18n: ['vue-i18n'],
          sentry: ['@sentry/electron', '@sentry/vue'],
          echarts: ['echarts'],
        },
      },
    },
    emptyOutDir: true,
    reportCompressedSize: true,
  },
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    UnoCSS(),
    AutoImport({
      imports: [
        'vue',
        'vue-router',
        unheadVueComposablesImports,
        {
          'naive-ui': ['useDialog', 'useMessage', 'useNotification', 'useLoadingBar'],
        },
      ],
    }),
    Components({
      resolvers: [NaiveUiResolver()],
    }),
    visualizer(),
  ],
}

export default config
