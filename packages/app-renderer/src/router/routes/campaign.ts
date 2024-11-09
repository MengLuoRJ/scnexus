import { type RouteRecordRaw } from "vue-router";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/campaign",
    name: "Campaign",
    component: () => import("@/layouts/BasicLayout.vue"),
    children: [
      {
        path: "active",
        name: "CampaignActive",
        meta: {
          title: "战役模组",
          public: true,
        },
        component: () => import("@/views/Campaign/CampaignView.vue"),
      },
      {
        path: "manage",
        name: "CampaignManage",
        meta: {
          title: "战役模组管理",
          public: true,
        },
        component: () => import("@/views/Campaign/CampaignManageView.vue"),
      },
    ],
  },
];

export default routes;
