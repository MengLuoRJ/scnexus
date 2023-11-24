import { NImage } from "naive-ui";
import { h } from "vue";
import { renderNaiveIcon, renderUnoIcon } from "./useIconRender";

import Logo from "@/assets/logo.png";
import MenuGame from "@/assets/menu/Menu_GamePlay.png";
import MenuMissions from "@/assets/menu/Menu_CampaignMissions.png";
import MenuCoop from "@/assets/menu/Menu_Coop.png";
import MenuProjectArcade from "@/assets/menu/Menu_ProjectArcade.png";

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
    // icon: renderUnoIcon("i-tabler:device-gamepad"),
    icon: renderNaiveIcon(
      h(NImage, { src: MenuGame, width: 32, height: 32, previewDisabled: true })
    ),
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
    // icon: renderUnoIcon("i-tabler:device-gamepad"),
    icon: renderNaiveIcon(
      h(NImage, { src: MenuMissions, width: 32, height: 32, previewDisabled: true })
    ),
  },
  // {
  //   key: "divider-3",
  //   type: "divider",
  //   props: {
  //     style: {
  //       marginLeft: "12px",
  //       marginRight: "12px",
  //     },
  //   },
  // },
  // {
  //   key: "coop",
  //   label: "合作任务",
  //   // icon: renderUnoIcon("i-tabler:device-gamepad"),
  //   icon: renderNaiveIcon(
  //     h(NImage, { src: MenuCoop, width: 32, height: 32, previewDisabled: true })
  //   ),
  // },
  {
    key: "divider-4",
    type: "divider",
    props: {
      style: {
        marginLeft: "12px",
        marginRight: "12px",
      },
    },
  },
  {
    key: "pa",
    label: "大厅计划",
    // icon: renderUnoIcon("i-tabler:device-gamepad"),
    icon: renderNaiveIcon(
      h(NImage, {
        src: MenuProjectArcade,
        width: 32,
        height: 32,
        previewDisabled: true,
      })
    ),
  },
  {
    key: "divider-5",
    type: "divider",
    props: {
      style: {
        marginLeft: "12px",
        marginRight: "12px",
      },
    },
  },
];
