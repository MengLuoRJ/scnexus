import { type RouteRecordRaw } from "vue-router";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/campaign",
    name: `campaign_root`,
    component: () => import("@/layouts/BasicLayout.vue"),
    children: [
      {
        path: "",
        name: "campaign",
        meta: {
          title: "战役管理",
          public: true,
        },
        component: () => import("@/views/Campaign/CampaignView.vue"),
      },
      {
        path: "manage",
        name: "campaign-manage",
        meta: {
          title: "战役包管理",
          public: true,
        },
        component: () => import("@/views/Campaign/CampaignManageView.vue"),
      },
    ],
  },
];

export default routes;
