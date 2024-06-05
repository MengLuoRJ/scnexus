import { type RouteRecordRaw } from "vue-router";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/user",
    name: `user_root`,
    component: () => import("@/layouts/BasicLayout.vue"),
    children: [
      {
        path: "",
        name: "user",
        meta: {
          title: "User",
          public: true,
        },
        component: () => import("@/views/User/UserView.vue"),
      },
    ],
  },
];

export default routes;
