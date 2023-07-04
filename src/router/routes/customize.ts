import { type RouteRecordRaw } from "vue-router";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/customize",
    name: `customize_root`,
    component: () => import("@/layouts/BasicLayout.vue"),
    children: [
      {
        path: "",
        name: "customize",
        meta: {
          title: "Customize",
          public: true,
        },
        component: () => import("@/views/Customize/CustomizeView.vue"),
      },
    ],
  },
];

export default routes;
