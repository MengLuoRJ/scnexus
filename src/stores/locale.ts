import { getPreferredSystemLanguages } from "@/composables/useIpcHost/useAppIpc";
import { useLocale } from "@/composables/useTrans";
import { get, set, usePreferredLanguages } from "@vueuse/core";
import { defineStore } from "pinia";
import { ref } from "vue";

export type LOCALE = "en" | "zh";
export const AVAILABLE = [
  {
    key: "zh" as LOCALE,
    value: "简体中文",
    cmpt: ["zh-CN", "zh-TW", "zh-Hans-CN", "zh-Hant-CN"],
    status: "原生",
    progress: "100%",
  },
  {
    key: "en" as LOCALE,
    value: "English",
    cmpt: ["en-US", "en-GB"],
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
      let suitable: LOCALE = get(current);
      preferred.find((i) => {
        const j = AVAILABLE.find(
          (k) =>
            k.key === i ||
            k.cmpt.some((l) => l === i) ||
            k.key === i.split("-")[0]
        );
        if (j) {
          suitable = j.key;
          return true;
        } return false;
      });
      if (suitable && suitable !== get(current)) {
        setLocale(suitable);
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
