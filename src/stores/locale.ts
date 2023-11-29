import { getPreferredSystemLanguages } from "@/composables/useIpcHost/useAppIpc";
import { useLocale } from "@/composables/useTrans";
import { get, set, usePreferredLanguages } from "@vueuse/core";
import { defineStore } from "pinia";
import { ref } from "vue";

export type LOCALE = "en" | "zh";
export const AVAILABLE = [
  {
    key: "zh",
    value: "简体中文",
    cmpt: "zh-CN",
    status: "原生",
    progress: "100%",
  },
  {
    key: "en",
    value: "English",
    cmpt: "en-US",
    status: "WIP",
    progress: "1%",
  },
] as const;

export function getAvailable(local: LOCALE) {
  return AVAILABLE.find((i) => i.key === local);
}

export const useLocaleStore = defineStore(
  "locale",
  () => {
    const current = ref<LOCALE>("en");
    const availables = ref(AVAILABLE);

    const setLocale = (locale: LOCALE) => {
      const available = getAvailable(locale);
      if (available) {
        set(current, available.key);
        console.log("set locale", available);
      }
    };

    const initLocale = async () => {
      const preferred = await getPreferredSystemLanguages();
      const suiable = preferred.find((i) =>
        AVAILABLE.some(
          (j) => j.key === i || j.cmpt === i || j.key === i.split("-")[0]
        )
      );
      if (suiable && suiable !== get(current)) {
        setLocale(suiable as LOCALE);
      }
    };

    const getCurrent = () => {
      return getAvailable(get(current));
    };

    return {
      current,
      availables,
      setLocale,
      initLocale,
      getCurrent,
    };
  },
  { persist: true }
);
