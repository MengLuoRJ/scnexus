import { get } from "@vueuse/core";
import {
  createDiscreteApi,
  lightTheme,
  darkTheme,
  ConfigProviderProps,
} from "naive-ui";
import { computed } from "vue";

const dark = false;

const naiveTheme = computed(() => {
  return dark ? darkTheme : lightTheme;
});

const configProviderPropsRef = computed<ConfigProviderProps>(() => ({
  theme: get(naiveTheme),
}));

export function useDiscreteApi<
  T extends "message" | "notification" | "loadingBar" | "dialog"
>(include: T[]) {
  return createDiscreteApi(include, {
    configProviderProps: configProviderPropsRef,
    messageProviderProps: {
      placement: "bottom-right",
    },
    notificationProviderProps: {
      placement: "bottom-right",
    },
  });
}
