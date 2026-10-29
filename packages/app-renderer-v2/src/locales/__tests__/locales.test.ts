import { describe, expect, test } from 'vitest'
import { createI18n } from 'vue-i18n'
import { i18n, messages } from '..'

const locales = ['zh', 'en', 'zh-Hant'] as const
const modules = import.meta.glob<string>('../*/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
})

describe('modular locale resources', () => {
  test.each(locales)('%s explicitly exports all modules without duplicate keys', (locale) => {
    const merged: Record<string, string> = {}
    const files = Object.entries(modules).filter(([path]) => path.startsWith(`../${locale}/`))
    expect(files.length).toBeGreaterThan(0)

    for (const [path, source] of files) {
      const module = path.split('/').at(-1)!.replace('.json', '')
      const keys = [...source.matchAll(/^\s*("(?:\\.|[^"\\])*")\s*:/gm)].map(
        (match) => JSON.parse(match[1]!) as string,
      )
      const entries = JSON.parse(source) as Record<string, string>
      expect(new Set(keys).size).toBe(keys.length)
      expect(keys.sort()).toEqual(Object.keys(entries).sort())
      for (const [key, value] of Object.entries(entries)) {
        expect(key.split('.')[0]).toBe(module)
        expect(typeof value).toBe('string')
        expect(Object.hasOwn(merged, key)).toBe(false)
        merged[key] = value
      }
    }

    expect(messages[locale]).toEqual(merged)
    expect(Object.keys(merged).sort()).toEqual(Object.keys(messages.zh).sort())
  })

  test.each(locales)('%s loads both base and workshop modules', (locale) => {
    const previous = i18n.global.locale.value
    try {
      i18n.global.locale.value = locale
      for (const key of [
        'ui.welcome',
        'downloads.openLocation',
        'downloads.openLocationError',
      ] as const) {
        expect(i18n.global.t(key)).toBe(messages[locale][key])
      }
    } finally {
      i18n.global.locale.value = previous
    }
  })

  test('missing English translations and unsupported languages fall back to Chinese', () => {
    const en: Record<string, string> = { ...messages.en }
    delete en['downloads.openLocation']
    const instance = createI18n({
      legacy: false,
      locale: 'en',
      fallbackLocale: 'zh',
      flatJson: true,
      missingWarn: false,
      fallbackWarn: false,
      messages: { en, zh: { ...messages.zh }, fr: {} },
    })

    expect(instance.global.t('downloads.openLocation')).toBe(messages.zh['downloads.openLocation'])
    instance.global.locale.value = 'fr'
    expect(instance.global.t('ui.welcome')).toBe(messages.zh['ui.welcome'])
    expect(instance.global.t('downloads.openLocationError')).toBe(
      messages.zh['downloads.openLocationError'],
    )
    instance.dispose()
  })
})
