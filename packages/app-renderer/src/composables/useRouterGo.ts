import router from "@/router";
import { RouteLocationAsRelativeTyped, RouteMapGeneric } from "vue-router";

export const useRouterGo = (
  resolver: RouteLocationAsRelativeTyped<RouteMapGeneric, string | symbol>,
  method: "push" | "replace" | "_blank" = "push"
) => {
  const resloved = router.resolve(resolver);
  if (method === "push") {
    router.push(resloved);
  } else if (method === "replace") {
    router.replace(resloved);
  } else if (method === "_blank") {
    window.open(resloved.href);
  }
};
