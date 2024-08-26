import { type RouteRecordRaw } from "vue-router";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/workshop",
    name: `workshop_root`,
    component: () => import("@/layouts/BasicLayout.vue"),
    children: [
      {
        path: "",
        name: "workshop",
        meta: {
          title: "创意工坊",
        },
        component: () => import("@/views/Workshop/WorkshopView.vue"),
      },
      {
        path: "customize",
        name: "workshop_customize",
        meta: {
          title: "自定义工坊",
        },
        component: () => import("@/views/Workshop/WorkshopCustomizeView.vue"),
      },
      {
        path: "campaign",
        name: "workshop_campaign",
        meta: {
          title: "战役包工坊",
        },
        component: () => import("@/views/Workshop/WorkshopCampaignView.vue"),
      },
      {
        path: "item/:snid",
        name: "workshop_item",
        meta: {
          title: "创意工坊作品",
        },
        props: true,
        component: () => import("@/views/Workshop/WorkshopItemView.vue"),
      },
    ],
  },
];

export default routes;
