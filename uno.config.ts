import { defineConfig, presetUno, presetIcons } from "unocss";
import transformerDirectives from "@unocss/transformer-directives";

export default defineConfig({
  shortcuts: [
    {
      "cell-normal": "py-1 px-2 border border-gray-200 border-solid rounded-2",
    },
    [/^cell-normal-(.*)$/, ([, c]) => `bg-${c} cell-normal`],
    {
      "cell-hoverable":
        "cell-normal hover:shadow hover:transition-shadow duration-300",
    },
  ],
  theme: {},
  presets: [presetUno(), presetIcons()],
  transformers: [transformerDirectives()],
  safelist: [
    ...[
      "#1D9BF0",
      "#616BE6",
      "#FB7299",
      "#F0D850",
      "#946CE6",
      "#DD3E22",
      "#B94334",
      "#000000",
    ]
      .map((i) => [`border-[${i}]`, `text-[${i}]`])
      .flat(),
  ],
});
