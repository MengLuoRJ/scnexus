import { afterEach, expect, test, vi } from 'vitest'
import { ref, defineComponent } from 'vue'
import type { Plugin } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CustomizeUninstallModal from '../components/CustomizeUninstallModal.vue'
import type { useCustomize } from '../useCustomize'
import type { ContentRecord, RemovalPreview } from '@scnexus/app-shared/types/content.type'
import zh from '../../../locales/zh.json'
const modal = defineComponent({
  props: ['open'],
  template: '<div v-if="open"><slot name="body"/><slot name="footer"/></div>',
})
const button = defineComponent({
  props: ['disabled', 'loading'],
  emits: ['click'],
  template:
    '<button :disabled="disabled || loading" :data-loading="loading" @click="$emit(\'click\')"><slot/></button>',
})
const wrappers: { unmount: () => void }[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})
test('uninstall requires confirmation and a choice for each shared file, then waits for completion', async () => {
  const removal = ref<RemovalPreview | null>(null)
  const prepare = vi.fn<(record: ContentRecord) => Promise<void>>(async () => {
    removal.value = {
      removalId: 'rm',
      localId: 'r',
      operation: 'uninstall',
      files: [
        {
          conflictId: 'shared',
          file: { target: 'Mods/Core.SC2Mod' },
          usedBy: [{ localId: 'other', name: 'Other', type: 'customize' }],
        },
      ],
    } as RemovalPreview
  })
  let complete!: (value: unknown) => void
  const confirm = vi.fn<(...args: unknown[]) => Promise<unknown>>(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  const service = {
    busy: ref(false),
    removal,
    prepare,
    confirm,
    close: vi.fn<() => Promise<void>>(async () => {
      removal.value = null
    }),
  } as unknown as ReturnType<typeof useCustomize>
  const wrapper = mount(CustomizeUninstallModal, {
    props: { service, record: null },
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'zh',
          flatJson: true,
          messages: { zh },
        }) as unknown as Plugin,
      ],
      stubs: { Modal: modal, Button: button, Progress: true },
    },
  })
  wrappers.push(wrapper)
  const record = { localId: 'r', package: { name: 'Custom' } } as ContentRecord
  await wrapper.setProps({ record })
  await flushPromises()
  expect(prepare).toHaveBeenCalledWith(record)
  const execute = () => wrapper.findAll('button').find((item) => item.text() === '确认执行')!
  expect(execute().attributes('disabled')).toBeDefined()
  await wrapper
    .findAll('button')
    .find((item) => item.text() === '保留本地文件')!
    .trigger('click')
  await execute().trigger('click')
  expect(confirm).toHaveBeenCalledWith([], [{ conflictId: 'shared', action: 'keep' }])
  expect(execute().attributes('data-loading')).toBe('true')
  expect(wrapper.emitted('close')).toBeUndefined()
  complete({ installed: null })
  await flushPromises()
  expect(wrapper.emitted('completed')).toHaveLength(1)
  expect(wrapper.emitted('close')).toHaveLength(1)
})
