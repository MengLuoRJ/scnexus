import { expect, test } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type {
  ReplayAnalysis,
  ReplayComponentCapability,
} from '@scnexus/app-shared/types/replay.type'
import ReplayChat from '../ReplayChat.vue'
import en from '../../../locales/en'
import zh from '../../../locales/zh'
import zhHant from '../../../locales/zh-Hant'

type Chat = NonNullable<ReplayAnalysis['chat']>
const message: Chat['messages'][number] = {
  gameLoop: 960,
  userId: 7,
  playerId: 2,
  slot: 1,
  name: null,
  recipient: 123,
  text: 'hello',
}
function render(chat?: Chat, locale = 'en', capability?: ReplayComponentCapability) {
  return mount(ReplayChat, {
    props: { chat, capability },
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: { en, zh, 'zh-Hant': zhHant } })],
      stubs: {
        Button: defineComponent({
          props: ['label', 'disabled'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
        }),
        Select: defineComponent({
          props: ['modelValue', 'items'],
          emits: ['update:modelValue'],
          template:
            '<select :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value))"><option v-for="size in items" :key="size" :value="size">{{ size }}</option></select>',
        }),
      },
    },
  })
}

test.each(['en', 'zh', 'zh-Hant'])(
  'distinguishes missing, empty and unavailable chat (%s)',
  async (locale) => {
    const wrapper = render(undefined, locale)
    const translations = { en, zh, 'zh-Hant': zhHant }[locale]!
    expect(wrapper.text()).toContain(translations['replay.analysisFailed'])
    await wrapper.setProps({ chat: { state: 'available', messages: [], warnings: [] } })
    expect(wrapper.text()).toContain(translations['replay.chat.empty'])
    expect(wrapper.text()).not.toContain(translations['replay.analysisFailed'])
    await wrapper.setProps({
      chat: { state: 'unavailable', messages: [], warnings: ['decode failed'] },
    })
    expect(wrapper.text()).toContain(translations['replay.analysisFailed'])
    expect(wrapper.text()).not.toContain(translations['replay.chat.empty'])
    expect(wrapper.text()).not.toContain('decode failed')
    expect(wrapper.text()).not.toContain('replay.chat.')
    wrapper.unmount()
  },
)

test('partial empty chat fails while usable partial messages remain visible without warnings', async () => {
  const wrapper = render({ state: 'partial', messages: [], warnings: ['Unknown build fallback'] })
  expect(wrapper.text()).not.toContain('unverified protocol')
  expect(wrapper.text()).toContain(en['replay.analysisFailed'])
  expect(wrapper.text()).not.toContain('Unknown build fallback')
  await wrapper.setProps({
    chat: { state: 'available', messages: [message], warnings: [] },
    capability: { state: 'partial', decoder: 'message', sourceBuild: 97364 },
  })
  expect(wrapper.text()).not.toContain('unverified protocol')
  expect(wrapper.findAll('ol > li')).toHaveLength(1)
  wrapper.unmount()
})

test('uses unknown names without internal IDs and displays game time', () => {
  const wrapper = render({ state: 'available', messages: [message], warnings: [] })
  const row = wrapper.get('ol > li')
  expect(row.text()).toContain(en['replay.unknown'])
  expect(row.text()).not.toContain('User #2')
  expect(row.text()).not.toContain('Recipient #123')
  expect(row.text()).toContain('1:00')
  expect(wrapper.text()).toContain(en['replay.chat.gameTime'])
  wrapper.unmount()
})

test('renders decoded names, HTML-like chat and warning text as escaped plain text', () => {
  const wrapper = render({
    state: 'partial',
    messages: [
      {
        ...message,
        name: '&lt;img src=x&gt;<sp/>Name',
        text: '<img src=x onerror="alert(1)">\n&amp;',
      },
    ],
    warnings: ['<script>alert(1)</script>'],
  })
  expect(wrapper.text()).toContain('<img src=x> Name')
  expect(wrapper.get('ol p').text()).toContain('<img src=x onerror="alert(1)">\n&amp;')
  expect(wrapper.text()).not.toContain('<script>alert(1)</script>')
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.find('script').exists()).toBe(false)
  expect(wrapper.html()).toContain('&lt;img')
  wrapper.unmount()
})

test('paginates 20/50 messages, resets on new analysis, and wraps long text', async () => {
  const longText = 'x'.repeat(4000) + '\nsecond line'
  const messages = Array.from({ length: 61 }, (_, index) => ({
    ...message,
    text: index === 0 ? longText : `message-${index}`,
  }))
  const wrapper = render({ state: 'available', messages, warnings: [] })
  expect(wrapper.findAll('ol > li')).toHaveLength(20)
  expect(wrapper.get('ol p').text()).toBe(longText)
  expect(wrapper.get('ol p').classes()).toContain('whitespace-pre-wrap')
  expect(wrapper.get('ol p').classes()).toContain('[overflow-wrap:anywhere]')
  expect(wrapper.findAll('button')[0]!.attributes('disabled')).toBeDefined()
  await wrapper.findAll('button')[1]!.trigger('click')
  expect(wrapper.get('ol p').text()).toBe('message-20')
  await wrapper.get('select').setValue('50')
  expect(wrapper.findAll('ol > li')).toHaveLength(50)
  expect(wrapper.get('ol p').text()).toBe(longText)
  await wrapper.findAll('button')[1]!.trigger('click')
  expect(wrapper.findAll('ol > li')).toHaveLength(11)
  expect(wrapper.get('ol p').text()).toBe('message-50')
  expect(wrapper.findAll('button')[1]!.attributes('disabled')).toBeDefined()
  await wrapper.setProps({ chat: { state: 'available', messages: [message], warnings: [] } })
  expect(wrapper.findAll('ol > li')).toHaveLength(1)
  expect(wrapper.get('ol p').text()).toBe('hello')
  expect(wrapper.text()).toContain('1 / 1')
  wrapper.unmount()
})
