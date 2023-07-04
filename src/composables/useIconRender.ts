import { NIcon } from "naive-ui";
import { Component, h } from "vue";

export function renderNaiveIcon(icon: Component) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

export function renderUnoIcon(
  icon_class: string,
  {
    size,
    width = "32px",
    height = "32px",
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
