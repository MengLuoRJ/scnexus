import { createI18n } from 'vue-i18n'
import zhCN from './zh.json'
import enUS from './en.json'
import zhTW from './zh-Hant.json'
export const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'zh',
  flatJson: true,
  messages: { zh: zhCN, en: enUS, 'zh-Hant': zhTW },
})
