import { createI18n } from 'vue-i18n'
import zhCN from './zh.json'
import enUS from './en.json'
import zhTW from './zh-Hant.json'
import workshopZh from './workshop.zh.json'
import workshopEn from './workshop.en.json'
import workshopTw from './workshop.zh-Hant.json'
export const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'zh',
  flatJson: true,
  messages: {
    zh: { ...zhCN, ...workshopZh },
    en: { ...enUS, ...workshopEn },
    'zh-Hant': { ...zhTW, ...workshopTw },
  },
})
