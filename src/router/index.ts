import {
  createRouter,
  createWebHashHistory,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";
import type { App } from "vue";

const routes = import.meta.glob("./routes/*.ts", {
  eager: true,
  import: "default",
});

const routeList: RouteRecordRaw[] = [];

Object.keys(routes).forEach((key) => {
  const route = routes[key] || {};
  const routeArray = Array.isArray(route) ? [...route] : [route];
  routeList.push(...routeArray);
});

routeList.sort((a, b) => {
  return ((a.meta?.order as number) || 0) - ((b.meta?.order as number) || 0);
});

const router = createRouter({
  // history: createWebHistory(import.meta.env.BASE_URL),
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: routeList,
  strict: true,
  scrollBehavior: () => ({ left: 0, top: 0 }),
});

export function setupRouter(app: App) {
  app.use(router);
  // createRouterGuards(router);
}

export default router;
