import { NIcon, } from "naive-ui";
import { type Component, h } from "vue";

export function renderNaiveIcon(
  icon: Component,
  {
    color,
    depth,
    size,
  }: { color?: string; depth?: 1 | 2 | 3 | 4 | 5; size?: number | string } = {}
) {
  return () => h(NIcon, { color, depth, size }, { default: () => h(icon) });
}

export function renderNaiveIconSvg(src: string) {
  return () => h(NIcon, null, { default: () => h("img", { src }) });
}

export function renderUnoIcon(
  icon_class: string,
  {
    size,
    width = "18px",
    height = "18px",
  }: {
    size?: string;
    width?: string;
    height?: string;
  } = {}
) {
  return () =>
    h("div", {
      class: `w-[${size ?? width}] h-[${size ?? height}]` + " " + icon_class,
    });
}
