import {
  MenuDividerOption,
  MenuGroupOption,
  MenuOption,
  NImage,
} from "naive-ui";
import { computed, h } from "vue";
import {
  renderNaiveIcon,
  renderUnoIcon,
} from "../../composables/useIconRender";

import Logo from "@/assets/logo.png";
import MenuGame from "@/assets/menu/Menu_GamePlay.png";
import MenuCustomize from "@/assets/menu/Menu_Customize.png";
import MenuMissions from "@/assets/menu/Menu_CampaignMissions.png";
import MenuCoop from "@/assets/menu/Menu_Coop.png";
import MenuProjectArcade from "@/assets/menu/Menu_ProjectArcade.png";
import MenuCreator from "@/assets/menu/Menu_Creator.png";

import { useUserStore } from "@/stores/user";

const renderMenuIcon = (iconSrc: string) => {
  return renderNaiveIcon(
    h(NImage, {
      class: "menu-icon",
      src: iconSrc,
      previewDisabled: true,
    })
  );
};

const defaultlist = [
  {
    key: "home",
    label: "星际枢纽",
    icon: renderMenuIcon(Logo),
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
    icon: renderMenuIcon(MenuGame),
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
    icon: renderMenuIcon(MenuCustomize),
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
    show: false,
  },
  {
    key: "workshop",
    label: "创意工坊",
    icon: renderMenuIcon(MenuMissions),
    show: false,
  },
  {
    key: "divider-4",
    type: "divider",
    props: {
      style: {
        marginLeft: "12px",
        marginRight: "12px",
      },
    },
    show: false,
  },
  {
    key: "coop",
    label: "合作任务",
    icon: renderMenuIcon(MenuCoop),
    show: false,
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
  {
    key: "pa",
    label: "大厅计划",
    icon: renderMenuIcon(MenuProjectArcade),
  },
  {
    key: "divider-6",
    type: "divider",
    props: {
      style: {
        marginLeft: "12px",
        marginRight: "12px",
      },
    },
    show: false,
  },
  {
    key: "creator",
    label: "创作服务",
    icon: renderMenuIcon(MenuCreator),
    show: false,
  },
];

export const MenuList = computed(() => {
  const userStore = useUserStore();
  const list = defaultlist;
  if (userStore.roles.includes("creator")) {
    // if user donot have `creator` role,
    // find item with key `creator` and `divider-6`,
    // and set its `show` property to `false`.
    const i_divider5 = list.findIndex((i) => i.key === "divider-6");
    if (i_divider5 !== -1) {
      list[i_divider5].show = true;
    }
    const i_creator = list.findIndex((i) => i.key === "creator");
    if (i_creator !== -1) {
      list[i_creator].show = true;
    }
  }
  return list;
});
