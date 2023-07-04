import { defineConfig, presetUno, presetIcons } from "unocss";
import transformerDirectives from "@unocss/transformer-directives";

export default defineConfig({
  shortcuts: [],
  theme: {},
  presets: [presetUno(), presetIcons()],
  transformers: [transformerDirectives()],
});
