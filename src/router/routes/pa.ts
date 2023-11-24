import { type RouteRecordRaw } from "vue-router";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/pa",
    name: `pa_root`,
    component: () => import("@/layouts/BasicLayout.vue"),
    children: [
      {
        path: "",
        name: "pa",
        meta: {
          title: "ProjectArcade",
          public: true,
        },
        component: () => import("@/views/ProjectArcade/ProjectArcadeView.vue"),
      },
    ],
  },
];

export default routes;
