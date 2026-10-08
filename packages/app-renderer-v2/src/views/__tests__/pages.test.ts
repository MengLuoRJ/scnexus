import { expect, test } from 'vitest'
import { i18n } from '../../locales'
import zhCN from '../../locales/zh.json'
import enUS from '../../locales/en.json'
import zhTW from '../../locales/zh-Hant.json'
test('all interface languages provide matching flat translation keys', () => {
  expect(Object.keys(enUS).sort()).toEqual(Object.keys(zhCN).sort())
  expect(Object.keys(zhTW).sort()).toEqual(Object.keys(zhCN).sort())
})
test('interface language switches between Chinese and English', () => {
  expect(i18n.global.t('ui.welcome')).toBe('欢迎来到星际枢纽')
  i18n.global.locale.value = 'en'
  expect(i18n.global.t('ui.welcome')).toBe('Welcome to SCNexus')
  i18n.global.locale.value = 'zh'
})
