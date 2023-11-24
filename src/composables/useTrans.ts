import { i18n } from "@/locales";
import { useI18n } from "vue-i18n";

export const t = () => {
  const { t } = useI18n();
  return t;
};

/**
 * Only avaialble in top of setup function
 */
export const useLocale = () => {
  const { locale } = useI18n();
  return locale;
}
