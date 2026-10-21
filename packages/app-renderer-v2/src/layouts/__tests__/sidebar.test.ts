import { afterEach, expect, test } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth'
import AppSidebar from '../components/AppSidebar.vue'
import zh from '../../locales/zh.json'

const wrappers: { unmount(): void }[] = []
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
async function render() {
  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/account', name: 'account', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(AppSidebar, {
    global: {
      plugins: [
        pinia,
        router,
        createI18n({ legacy: false, locale: 'zh', flatJson: true, messages: { zh } }),
      ],
      stubs: {
        NavigationMenu: true,
        Avatar: defineComponent({ template: '<span data-avatar />' }),
        Button: defineComponent({
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot /></button>',
        }),
      },
    },
  })
  wrappers.push(wrapper)
  return { wrapper, router, auth: useAuthStore(pinia) }
}

test('sidebar account entry provides a placeholder avatar and navigates to account', async () => {
  const { wrapper, router } = await render()
  const entry = wrapper.get('a[href="/account"]')
  expect(entry.text()).toContain('未登录')
  expect(entry.find('[data-avatar]').exists()).toBe(true)
  await entry.trigger('click')
  await router.isReady()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(router.currentRoute.value.name).toBe('account')
  expect(wrapper.get('a').attributes('aria-current')).toBe('page')
})

test.each([
  ['signed-out', '未登录'],
  ['authenticating', '未登录'],
  ['mfa-pending', '未登录'],
  ['signed-in', 'Nexus_123'],
  ['refreshing', 'Nexus_123'],
] as const)('sidebar displays %s status expanded and collapsed', async (status, label) => {
  const { wrapper, auth } = await render()
  auth.snapshot = { ...auth.snapshot, status }
  auth.user = {
    id: 'user',
    sessionId: 'session',
    clientType: 'DESKTOP',
    twoFactorEnabled: false,
    nickname: 'Nexus_123',
    email: null,
  }
  await wrapper.vm.$nextTick()
  expect(wrapper.get('a').text()).toContain(label)
  await wrapper.get('button').trigger('click')
  expect(wrapper.get('a').text()).toBe('')
  expect(wrapper.get('a').attributes('aria-label')).toBe(`个人中心 · ${label}`)
  expect(wrapper.get('a').attributes('title')).toBe(`个人中心 · ${label}`)
  expect(wrapper.find('[data-avatar]').exists()).toBe(true)
})
