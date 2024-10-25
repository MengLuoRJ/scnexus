import type { Options } from "tsup";

export const tsup: Options = {
  splitting: false,
  clean: true,
  dts: true,
  sourcemap: true,
  format: ["cjs", "esm"],
  minify: true,
  bundle: true,
  skipNodeModulesBundle: true,
  entry: ["./src/**/index.ts"],
};
