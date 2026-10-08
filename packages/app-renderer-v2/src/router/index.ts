import { createRouter, createWebHashHistory } from "vue-router";
export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "home", component: () => import("../views/HomeView.vue") },
    { path: "/settings", name: "settings", component: () => import("../views/SettingsView.vue") },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
