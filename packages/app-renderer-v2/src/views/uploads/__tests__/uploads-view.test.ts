import { expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import View from '../UploadsView.vue'
import en from '../../../locales/en/workshop.json'
const mocks = vi.hoisted(() => ({
  resume: vi.fn<(id: string) => Promise<unknown>>(),
  load: vi.fn<() => Promise<void>>(),
  quota: vi.fn<() => Promise<unknown>>(),
}))
vi.mock('../../../stores/creator', () => ({
  useCreatorStore: () => ({ loadQuota: mocks.quota, quota: { maxPackageBytes: 1 } }),
}))
vi.mock('../../../stores/workshop', () => ({
  useWorkshopStore: () => ({
    uploads: [
      {
        taskId: 'old',
        name: 'Existing large upload',
        status: 'paused',
        size: 900000000,
        transferred: 10,
      },
    ],
    connect: () => () => {},
    load: mocks.load,
  }),
  unwrapWorkshop: (value: { data: unknown }) => value.data,
}))
vi.mock('../../../ipcs/workshop', () => ({
  ipcWorkshopResume: mocks.resume,
  ipcWorkshopPause: vi.fn<() => Promise<void>>(),
  ipcWorkshopCancel: vi.fn<() => Promise<void>>(),
}))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: vi.fn<() => void>() }) }))
test('existing uploads resume without applying lowered new-upload quotas', async () => {
  mocks.resume.mockResolvedValue({ data: { taskId: 'old' } })
  const button = defineComponent({
    emits: ['click'],
    template: '<button @click="$emit(\'click\')"><slot /></button>',
  })
  const wrapper = mount(View, {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en',
          flatJson: true,
          messages: { en },
        }) as unknown as Plugin,
      ],
      stubs: { Button: button, Alert: true, Badge: true, Progress: true },
    },
  })
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Resume')!
    .trigger('click')
  await flushPromises()
  expect(mocks.resume).toHaveBeenCalledWith('old')
  expect(mocks.load).toHaveBeenCalledOnce()
  expect(mocks.quota).not.toHaveBeenCalled()
  wrapper.unmount()
})
