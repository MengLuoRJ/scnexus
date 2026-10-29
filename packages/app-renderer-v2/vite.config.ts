import { fileURLToPath, URL } from 'node:url'
import { join } from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

import ui from '@nuxt/ui/vite'

import { visualizer } from 'rollup-plugin-visualizer'

import { localIconNames } from './scripts/local-icons.ts'
import electronVendorsCache from '../app-main/.electron-vendors.cache.json' with { type: 'json' }

const PACKAGE_ROOT = fileURLToPath(new URL('.', import.meta.url))
const PROJECT_ROOT = join(PACKAGE_ROOT, '../..')

export const uiIcons = {
  arrowDown: 'i-tabler-arrow-down',
  arrowLeft: 'i-tabler-arrow-left',
  arrowRight: 'i-tabler-arrow-right',
  arrowUp: 'i-tabler-arrow-up',
  caution: 'i-tabler-alert-circle',
  check: 'i-tabler-check',
  chevronDoubleLeft: 'i-tabler-chevrons-left',
  chevronDoubleRight: 'i-tabler-chevrons-right',
  chevronDown: 'i-tabler-chevron-down',
  chevronLeft: 'i-tabler-chevron-left',
  chevronRight: 'i-tabler-chevron-right',
  chevronUp: 'i-tabler-chevron-up',
  close: 'i-tabler-x',
  copy: 'i-tabler-copy',
  copyCheck: 'i-tabler-copy-check',
  dark: 'i-tabler-moon',
  drag: 'i-tabler-grip-vertical',
  ellipsis: 'i-tabler-dots',
  error: 'i-tabler-circle-x',
  external: 'i-tabler-arrow-up-right',
  eye: 'i-tabler-eye',
  eyeOff: 'i-tabler-eye-off',
  file: 'i-tabler-file',
  folder: 'i-tabler-folder',
  folderOpen: 'i-tabler-folder-open',
  hash: 'i-tabler-hash',
  info: 'i-tabler-info-circle',
  light: 'i-tabler-sun',
  loading: 'i-tabler-loader-2',
  menu: 'i-tabler-menu-2',
  minus: 'i-tabler-minus',
  panelClose: 'i-tabler-layout-sidebar-left-collapse',
  panelOpen: 'i-tabler-layout-sidebar-left-expand',
  plus: 'i-tabler-plus',
  reload: 'i-tabler-refresh',
  search: 'i-tabler-search',
  stop: 'i-tabler-square',
  star: 'i-tabler-star',
  success: 'i-tabler-circle-check',
  system: 'i-tabler-device-desktop',
  tip: 'i-tabler-bulb',
  upload: 'i-tabler-upload',
  warning: 'i-tabler-alert-triangle',
} as const

// https://vite.dev/config/
export default defineConfig({
  mode: process.env.MODE,
  root: PACKAGE_ROOT,
  envDir: PROJECT_ROOT,
  base: '',
  server: {
    fs: {
      strict: true,
    },
  },
  build: {
    sourcemap: true,
    target: `chrome${electronVendorsCache.chrome}`,
    outDir: 'dist',
    assetsDir: '.',
    minify: process.env.MODE !== 'development',
    rollupOptions: {
      input: join(PACKAGE_ROOT, 'index.html'),
    },
    emptyOutDir: true,
    reportCompressedSize: true,
  },
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    ui({
      root: PACKAGE_ROOT,
      prose: true,
      ui: { icons: uiIcons },
      icon: {
        clientBundle: {
          icons: localIconNames(PACKAGE_ROOT, uiIcons),
          scan: true,
        },
      },
      autoImport: {
        imports: ['vue', 'vue-router'],
        dirs: ['src/composables', 'src/stores', 'src/ipcs', 'src/apis', 'src/utils'],
        resolvers: [],
        vueTemplate: true,
      },
    }),
    visualizer(),
  ],
  resolve: {
    dedupe: ['vue', 'vue-router', '@iconify/vue'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
