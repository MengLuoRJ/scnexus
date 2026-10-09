import { fileURLToPath, URL } from "node:url";
import { join } from "node:path";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import vueDevTools from "vite-plugin-vue-devtools";

import ui from "@nuxt/ui/vite";

import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";

import { visualizer } from "rollup-plugin-visualizer";

import electronVendorsCache from "../app-main/.electron-vendors.cache.json" with { type: "json" };

const PACKAGE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(PACKAGE_ROOT, "../..");

// https://vite.dev/config/
export default defineConfig({
  mode: process.env.MODE,
  root: PACKAGE_ROOT,
  envDir: PROJECT_ROOT,
  base: "",
  server: {
    fs: {
      strict: true,
    },
  },
  build: {
    sourcemap: true,
    target: `chrome${electronVendorsCache.chrome}`,
    outDir: "dist",
    assetsDir: ".",
    minify: process.env.MODE !== "development",
    rollupOptions: {
      input: join(PACKAGE_ROOT, "index.html"),
    },
    emptyOutDir: true,
    reportCompressedSize: true,
  },
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    ui({
      icon: {
        clientBundle: {
          icons: [
            "tabler:home",
            "tabler:map",
            "tabler:settings",
            "tabler:planet",
            "tabler:layout-sidebar-left-expand",
            "tabler:layout-sidebar-left-collapse",
            "tabler:device-desktop",
            "tabler:alert-circle",
            "tabler:external-link",
          ],
        },
      },
      autoImport: {
        imports: ["vue", "vue-router"],
        dirs: ["src/composables", "src/stores", "src/ipcs"],
        resolvers: [],
        vueTemplate: true,
      },
    }),
    visualizer(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
