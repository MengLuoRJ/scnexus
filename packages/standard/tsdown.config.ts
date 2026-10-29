import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { 'package/index': './src/package/index.ts' },
  format: ['esm'],
  fixedExtension: false,
  clean: true,
  dts: { sourcemap: false },
  sourcemap: true,
  minify: true,
  hooks: {
    'build:done': () => {
      execFileSync(
        process.execPath,
        [fileURLToPath(new URL('./scripts/generate-schema.mjs', import.meta.url))],
        {
          stdio: 'inherit',
        },
      )
    },
  },
})
