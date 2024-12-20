import { type RouteRecordRaw } from "vue-router";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/campaign",
    name: "Campaign",
    redirect: "/campaign/active",
    component: () => import("@/layouts/BasicLayout.vue"),
    children: [
      {
        path: "active",
        name: "CampaignActive",
        meta: {
          title: "战役模组",
          public: true,
        },
        component: () => import("@/views/campaign/campaign-active/CampaignActiveView.vue"),
      },
      {
        path: "manage",
        name: "CampaignManage",
        meta: {
          title: "战役模组管理",
          public: true,
        },
        component: () => import("@/views/campaign/campaign-manage/CampaignManageView.vue"),
      },
    ],
  },
];

export default routes;
