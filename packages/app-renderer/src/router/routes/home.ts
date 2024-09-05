import { type RouteRecordRaw } from "vue-router";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "home_root",
    component: () => import("@/layouts/BasicLayout.vue"),
    children: [
      {
        path: "",
        name: `home`,
        meta: {
          title: "首页",
          public: true,
        },
        component: () => import("@/views/HomeView.vue"),
      },
    ],
  },
];

export default routes;
