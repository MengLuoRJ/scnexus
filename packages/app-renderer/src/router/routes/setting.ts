import { type RouteRecordRaw } from "vue-router";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/setting",
    name: `setting_root`,
    component: () => import("@/layouts/BasicLayout.vue"),
    children: [
      {
        path: "",
        name: "setting",
        meta: {
          title: "Setting",
          public: true,
        },
        component: () => import("@/views/Setting/SettingView.vue"),
      },
    ],
  },
];

export default routes;
