import { NImage } from "naive-ui";
import { h } from "vue";
import Logo from "@/assets/logo.png";
import { renderNaiveIcon, renderUnoIcon } from "./useIconRender";

export type Menu = {
  key: string;
  label: string;
  icon?: any;
  children?: Menu[];
};

export const MenuList = <Menu[]>[
  {
    key: "home",
    label: "星际枢纽",
    icon: renderNaiveIcon(
      h(NImage, { src: Logo, width: 32, height: 32, previewDisabled: true })
    ),
  },
  {
    key: "divider-1",
    type: "divider",
    props: {
      style: {
        marginLeft: "0px",
        marginRight: "0px",
      },
    },
  },
  {
    key: "campaign",
    label: "战役管理",
    icon: renderUnoIcon("i-tabler:device-gamepad"),
  },
  {
    key: "divider-2",
    type: "divider",
    props: {
      style: {
        marginLeft: "12px",
        marginRight: "12px",
      },
    },
  },
  {
    key: "customize",
    label: "自制作品",
    icon: renderUnoIcon("i-tabler:device-gamepad"),
  },
  {
    key: "divider-3",
    type: "divider",
    props: {
      style: {
        marginLeft: "12px",
        marginRight: "12px",
      },
    },
  },
];
