import type { Options } from 'tsup'

export const tsup: Options = {
  splitting: false,
  clean: true,
  dts: true,
  sourcemap: true,
  format: ['esm'],
  minify: true,
  bundle: true,
  skipNodeModulesBundle: true,
  entry: { 'package/index': './src/package/index.ts' },
}
