import { useLocaleStore } from "@/stores/locale";
import { get } from "@vueuse/core";
import {
  createDiscreteApi,
  lightTheme,
  darkTheme,
  dateEnUS,
  dateZhCN,
  enUS,
  zhCN,
  ConfigProviderProps,
} from "naive-ui";
import { computed } from "vue";

const localeStore = useLocaleStore();
const locale = get(localeStore.current);

const dark = false;

const naiveLocale = computed(() => {
  switch (locale) {
    case "zh":
      return {
        locale: zhCN,
        date: dateZhCN,
      };
    case "en":
      return {
        locale: enUS,
        date: dateEnUS,
      };
    default:
      return {
        locale: zhCN,
        date: dateZhCN,
      };
  }
});

const naiveTheme = computed(() => {
  return dark ? darkTheme : lightTheme;
});

const configProviderPropsRef = computed<ConfigProviderProps>(() => ({
  theme: get(naiveTheme),
  locale: get(naiveLocale).locale,
  dateLocale: get(naiveLocale).date,
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
