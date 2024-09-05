import { i18n } from "@/locales";
import { useI18n } from "vue-i18n";

/**
 * Only avaialble in top of setup function
 */
export const useLocale = () => {
  const { locale } = useI18n();
  return locale;
};

export const useTrans = () => i18n.global;
