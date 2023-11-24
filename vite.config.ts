import { rmSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { resolve, dirname } from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
// import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
import UnoCSS from "unocss/vite";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { unheadVueComposablesImports } from '@unhead/vue'
import { NaiveUiResolver } from "unplugin-vue-components/resolvers";
// import viteSentry, { type ViteSentryPluginOptions } from "vite-plugin-sentry";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import pkg from "./package.json";

// const sentryConfig: ViteSentryPluginOptions = {
//   configFile: "./.sentryclirc",
//   // legacyErrorHandlingMode: true, <- warn about sentry errors instead of fail
//   deploy: {
//     env: "production",
//   },
//   sourceMaps: {
//     include: ["./dist/assets"],
//     ignore: ["node_modules"],
//     urlPrefix: "~/assets",
//   },
// };

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  rmSync("dist-electron", { recursive: true, force: true });

  const isServe = command === "serve";
  const isBuild = command === "build";
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG;

  return {
    define: {
      __INTLIFY_JIT_COMPILATION__: true,
    },
    plugins: [
      vue(),
      // VueI18nPlugin({
      //   include: resolve(dirname(fileURLToPath(import.meta.url)), './src/locales/**/*.js'),
      //   jitCompilation: true,
      // }),
      UnoCSS(),
      AutoImport({
        imports: [
          "vue",
          unheadVueComposablesImports,
          {
            "naive-ui": [
              "useDialog",
              "useMessage",
              "useNotification",
              "useLoadingBar",
            ],
          },
        ],
      }),
      Components({
        resolvers: [NaiveUiResolver()],
      }),
      // viteSentry(sentryConfig),
      electron([
        {
          // Main-Process entry file of the Electron App.
          entry: "electron/main/index.ts",
          onstart(options) {
            if (process.env.VSCODE_DEBUG) {
              console.log(
                /* For `.vscode/.debug.script.mjs` */ "[startup] Electron App"
              );
            } else {
              options.startup();
            }
          },
          vite: {
            resolve: {
              alias: {
                "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
                "@electron": fileURLToPath(
                  new URL("./electron", import.meta.url)
                ),
                "@main": fileURLToPath(
                  new URL("./electron/main", import.meta.url)
                ),
                "@preload": fileURLToPath(
                  new URL("./electron/preload", import.meta.url)
                ),
              },
            },
            build: {
              sourcemap,
              minify: isBuild,
              outDir: "dist-electron/main",
              rollupOptions: {
                external: Object.keys(
                  "dependencies" in pkg ? pkg.dependencies : {}
                ),
              },
            },
          },
        },
        {
          entry: "electron/preload/index.ts",
          onstart(options) {
            // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete,
            // instead of restarting the entire Electron App.
            options.reload();
          },
          vite: {
            resolve: {
              alias: {
                "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
                "@electron": fileURLToPath(
                  new URL("./electron", import.meta.url)
                ),
                "@main": fileURLToPath(
                  new URL("./electron/main", import.meta.url)
                ),
                "@preload": fileURLToPath(
                  new URL("./electron/preload", import.meta.url)
                ),
              },
            },
            build: {
              sourcemap: sourcemap ? "inline" : undefined, // #332
              minify: isBuild,
              outDir: "dist-electron/preload",
              rollupOptions: {
                external: Object.keys(
                  "dependencies" in pkg ? pkg.dependencies : {}
                ),
              },
            },
          },
        },
      ]),
      // Use Node.js API in the Renderer-process
      // renderer({}),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
        "@electron": fileURLToPath(new URL("./electron", import.meta.url)),
        "@main": fileURLToPath(new URL("./electron/main", import.meta.url)),
        "@preload": fileURLToPath(
          new URL("./electron/preload", import.meta.url)
        ),
      },
    },
    server:
      process.env.VSCODE_DEBUG &&
      (() => {
        const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL);
        return {
          host: url.hostname,
          port: +url.port,
        };
      })(),
    clearScreen: false,
  };
});
