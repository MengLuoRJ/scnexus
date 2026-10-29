import { createI18n } from 'vue-i18n'
import zh from './zh'
import en from './en'
import zhHant from './zh-Hant'

export const messages = { zh, en, 'zh-Hant': zhHant }

export const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'zh',
  flatJson: true,
  // Vue I18n expands flat keys in place; keep the exported resources unchanged.
  messages: {
    zh: { ...messages.zh },
    en: { ...messages.en },
    'zh-Hant': { ...messages['zh-Hant'] },
  },
})
