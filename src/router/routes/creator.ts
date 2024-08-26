import { type RouteRecordRaw } from "vue-router";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/creator",
    name: `creator_root`,
    component: () => import("@/layouts/BasicLayout.vue"),
    children: [
      {
        path: "",
        name: "creator",
        meta: {
          title: "创作服务",
        },
        component: () => import("@/views/Creator/CreatorView.vue"),
      },
      {
        path: "uploader",
        name: "creator_uploader",
        meta: {
          title: "作品上传",
        },
        component: () => import("@/views/Creator/CreatorUploaderView.vue"),
      },
      {
        path: "manage",
        name: "creator_manage",
        meta: {
          title: "作品管理",
        },
        component: () => import("@/views/Creator/CreatorWorkshopManageView.vue"),
      }
    ],
  },
];

export default routes;
