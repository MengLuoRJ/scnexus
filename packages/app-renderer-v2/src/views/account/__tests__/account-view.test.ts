import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import type { Plugin } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import AccountView from '../AccountView.vue'
import { useAuthStore } from '../../../stores/auth'
import { useContentCenterStore } from '../../../stores/content-center'
import { AccountError } from '../../../apis/internal/client'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: async () => { } }),
}))
vi.mock('../CreatorStatus.vue', () => ({ default: { template: '<div />' } }))
const mocks = vi.hoisted(() => ({
  toast: vi.fn<(value: unknown) => void>(),
  deviceName: vi.fn<() => Promise<{ ok: true; data: string }>>(),
  saveNickname: vi.fn<(nickname: string) => Promise<string>>(),
  checkIn: vi.fn<() => Promise<unknown>>(),
  loadExperience: vi.fn<() => Promise<void>>(),
  policy: vi.fn<() => Promise<unknown>>(),
  writeText: vi.fn<(text: string) => Promise<void>>(),
}))
vi.mock('../usePersonalCenter', async () => {
  const { ref } = await import('vue')
  return {
    usePersonalCenter: () => ({
      experience: ref({
        experience: 90,
        level: 0,
        nextLevelExperience: 100,
        experienceToNextLevel: 10,
        checkedIn: false,
      }),
      loading: ref(false),
      saving: ref(false),
      checking: ref(false),
      error: ref(null),
      saveNickname: mocks.saveNickname,
      checkIn: mocks.checkIn,
      loadExperience: mocks.loadExperience,
    }),
  }
})
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
vi.mock('../../../ipcs/app', () => ({ ipcAppGetDeviceName: mocks.deviceName }))
vi.mock('../../../apis/account', () => ({
  apiRegistrationPolicy: mocks.policy,
  apiTwoFactorStatus: async () => ({
    twoFactorEnabled: useAuthStore().user?.twoFactorEnabled ?? false,
    twoFactorVerified: false,
    twoFactorVerifiedAt: null,
    recoveryCodesRemaining: 5,
  }),
}))
const card = defineComponent({
  template: '<div><slot name="header"/><slot/><slot name="footer"/></div>',
})
const field = defineComponent({
  props: ['name'],
  template: '<label :data-field="name"><slot/></label>',
})
const input = defineComponent({
  props: ['modelValue', 'disabled', 'type'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" :disabled="disabled" :type="type" @input="$emit(\'update:modelValue\', $event.target.value)"/>',
})
const select = defineComponent({
  props: ['modelValue', 'disabled', 'items'],
  emits: ['update:modelValue'],
  template:
    '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
})
const button = defineComponent({
  props: ['disabled', 'loading', 'type'],
  emits: ['click'],
  template:
    '<button :type="type || \'button\'" :disabled="disabled || loading" @click="$emit(\'click\')"><slot/></button>',
})
const form = defineComponent({
  props: ['state', 'validate'],
  emits: ['submit'],
  template: '<form @submit.prevent="$emit(\'submit\')"><slot/></form>',
})
const modal = defineComponent({
  props: ['open'],
  emits: ['update:open'],
  template: '<div v-if="open"><slot name="body"/><slot name="footer"/><slot/></div>',
})
const wrappers: { unmount(): void }[] = []
beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  useContentCenterStore().initialized = true
  vi.stubGlobal('scnexus', {})
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText: mocks.writeText },
    configurable: true,
  })
  mocks.deviceName.mockResolvedValue({ ok: true, data: 'Detected PC' })
  mocks.policy.mockResolvedValue({ invitationRequired: false })
  mocks.writeText.mockResolvedValue()
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function render() {
  const wrapper = mount(AccountView, {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          flatJson: true,
          locale: 'en',
          missingWarn: false,
          fallbackWarn: false,
          messages: { en: {} },
        }) as unknown as Plugin,
      ],
      stubs: {
        Card: card,
        FormField: field,
        Input: input,
        Select: select,
        Tabs: select,
        Avatar: true,
        Icon: true,
        Button: button,
        Form: form,
        Modal: modal,
        Alert: true,
        Progress: true,
        Badge: true,
        Tooltip: field,
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
type Wrapper = Awaited<ReturnType<typeof render>>
const fieldInput = (wrapper: Wrapper, name: string) => wrapper.get(`[data-field="${name}"] input`)
const namedButton = (wrapper: Wrapper, name: string) =>
  wrapper.findAll('button').find((item) => item.text() === `account.${name}`)!
const challenge = {
  accepted: true as const,
  challengeId: 'aabbccdd-1234-4567-8901-aabbccddeeff',
  expiresIn: 600,
  retryAfter: 60,
}
function mfa(store: ReturnType<typeof useAuthStore>) {
  store.snapshot = {
    ...store.snapshot,
    status: 'mfa-pending',
    epoch: 1,
    version: 1,
    mfaExpiresAt: Date.now() + 60000,
  }
}
test('official services disabled keeps account forms and policy requests inactive', async () => {
  useContentCenterStore().officialServicesEnabled = false
  const wrapper = await render()
  expect(wrapper.find('form').exists()).toBe(false)
  expect(mocks.policy).not.toHaveBeenCalled()
  useContentCenterStore().officialServicesEnabled = true
  await flushPromises()
  expect(wrapper.find('form').exists()).toBe(true)
  expect(mocks.policy).toHaveBeenCalledOnce()
})
test.each(['network', 'forbidden', 'invalidResponse'] as const)(
  'policy failure %s reports unavailable registration without an internal reload button',
  async (kind) => {
    mocks.policy.mockRejectedValue(new AccountError(kind))
    const register = vi.spyOn(useAuthStore(), 'register')
    const wrapper = await render()
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      color: 'error',
      title: 'account.policyUnavailable',
      description: `account.error.${kind}`,
    })
    await wrapper.get('select').setValue('register')
    expect(wrapper.text()).not.toContain('account.reloadPolicy')
    expect(namedButton(wrapper, 'register').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(register).not.toHaveBeenCalled()
    expect(mocks.policy).toHaveBeenCalledOnce()
    await wrapper.get('select').setValue('login')
    expect(namedButton(wrapper, 'login').attributes('disabled')).toBeUndefined()
  },
)
test('pending policy does not expose a reload button and enables registration once loaded', async () => {
  let resolve!: (value: unknown) => void
  mocks.policy.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const wrapper = await render()
  await wrapper.get('select').setValue('register')
  expect(wrapper.text()).not.toContain('account.reloadPolicy')
  expect(namedButton(wrapper, 'register').attributes('disabled')).toBeDefined()
  resolve({ invitationRequired: true })
  await flushPromises()
  expect(namedButton(wrapper, 'register').attributes('disabled')).toBeUndefined()
  expect(mocks.toast).not.toHaveBeenCalled()
})
test('same-tick subject and password input survives, login MFA clears secrets without success', async () => {
  const store = useAuthStore()
  const login = vi.spyOn(store, 'login').mockImplementation(async () => {
    mfa(store)
  })
  const wrapper = await render()
  const subject = fieldInput(wrapper, 'subject').setValue('a@b.com')
  const password = fieldInput(wrapper, 'password').setValue('secret')
  const device = fieldInput(wrapper, 'deviceName').setValue('desktop')
  await Promise.all([subject, password, device])
  expect((fieldInput(wrapper, 'password').element as HTMLInputElement).value).toBe('secret')
  const fields = wrapper.findComponent(form).props('state')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(login).toHaveBeenCalledExactlyOnceWith({
    subject: 'a@b.com',
    password: 'secret',
    deviceName: 'desktop',
  })
  expect(fields.password).toBe('')
  expect(fields.proof).toBe('')
  expect(wrapper.find('[data-field="factor"] input').exists()).toBe(true)
  expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
})
test('failed login clears password and changing subject clears previous secrets', async () => {
  const store = useAuthStore()
  vi.spyOn(store, 'login').mockRejectedValue(new Error('failed login'))
  const wrapper = await render()
  await fieldInput(wrapper, 'subject').setValue('a@b.com')
  await fieldInput(wrapper, 'password').setValue('secret')
  await fieldInput(wrapper, 'deviceName').setValue('desktop')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect((fieldInput(wrapper, 'password').element as HTMLInputElement).value).toBe('')
  await fieldInput(wrapper, 'password').setValue('old-secret')
  await fieldInput(wrapper, 'subject').setValue('other@b.com')
  expect((fieldInput(wrapper, 'password').element as HTMLInputElement).value).toBe('')
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
})
test('registration submits the paired challenge and leading-zero proof, then clears both secrets', async () => {
  const store = useAuthStore()
  const request = vi.spyOn(store, 'requestChallenge').mockResolvedValue(challenge)
  const register = vi.spyOn(store, 'register').mockRejectedValue(new Error('failed registration'))
  const wrapper = await render()
  await wrapper.get('select').setValue('register')
  await fieldInput(wrapper, 'subject').setValue('a@b.com')
  await fieldInput(wrapper, 'password').setValue('StrongPass1!')
  await fieldInput(wrapper, 'deviceName').setValue('desktop')
  await namedButton(wrapper, 'sendCode').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenCalledExactlyOnceWith({ subject: 'a@b.com', purpose: 'REGISTER' })
  await fieldInput(wrapper, 'proof').setValue('012345')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(register).toHaveBeenCalledExactlyOnceWith({
    subject: 'a@b.com',
    password: 'StrongPass1!',
    deviceName: 'desktop',
    challengeId: challenge.challengeId,
    proof: '012345',
  })
  expect((fieldInput(wrapper, 'password').element as HTMLInputElement).value).toBe('')
  expect((fieldInput(wrapper, 'proof').element as HTMLInputElement).value).toBe('')
  await fieldInput(wrapper, 'subject').setValue('other@b.com')
  await fieldInput(wrapper, 'password').setValue('StrongPass1!')
  await fieldInput(wrapper, 'proof').setValue('012345')
  await wrapper.get('form').trigger('submit')
  expect(register).toHaveBeenCalledOnce()
})
test.each(['subject', 'epoch'])(
  'a challenge arriving after %s changes is discarded',
  async (change) => {
    const store = useAuthStore()
    let resolve!: (value: typeof challenge) => void
    vi.spyOn(store, 'requestChallenge').mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const register = vi.spyOn(store, 'register').mockResolvedValue()
    const wrapper = await render()
    await wrapper.get('select').setValue('register')
    await fieldInput(wrapper, 'subject').setValue('a@b.com')
    await namedButton(wrapper, 'sendCode').trigger('click')
    // Programmatic updates can race even when the visible field is disabled.
    if (change === 'subject') wrapper.findComponent(form).props('state').subject = 'other@b.com'
    else store.snapshot = { ...store.snapshot, epoch: store.snapshot.epoch + 1 }
    resolve(challenge)
    await flushPromises()
    await fieldInput(wrapper, 'password').setValue('StrongPass1!')
    await fieldInput(wrapper, 'deviceName').setValue('desktop')
    await fieldInput(wrapper, 'proof').setValue('012345')
    await wrapper.get('form').trigger('submit')
    expect(register).not.toHaveBeenCalled()
  },
)
test('MFA submits only the chosen factor, clears failed codes, and cancels through logout', async () => {
  const store = useAuthStore()
  mfa(store)
  const verify = vi.spyOn(store, 'completeMfa').mockRejectedValue(new Error('invalid factor'))
  const logout = vi.spyOn(store, 'logout').mockImplementation(async () => {
    store.snapshot = {
      ...store.snapshot,
      status: 'signed-out',
      epoch: 2,
      version: 2,
      mfaExpiresAt: null,
    }
    return { remoteRevoked: true }
  })
  const wrapper = await render()
  await fieldInput(wrapper, 'factor').setValue('012345')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(verify).toHaveBeenLastCalledWith({ code: '012345' })
  expect((fieldInput(wrapper, 'factor').element as HTMLInputElement).value).toBe('')
  await fieldInput(wrapper, 'factor').setValue('654321')
  await wrapper.get('select').setValue('recovery')
  expect((fieldInput(wrapper, 'factor').element as HTMLInputElement).value).toBe('')
  await fieldInput(wrapper, 'factor').setValue('abcdef0123456789abcdef0123456789')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(verify).toHaveBeenLastCalledWith({ recoveryCode: 'abcdef0123456789abcdef0123456789' })
  const factorState = wrapper.findComponent(form).props('state')
  await namedButton(wrapper, 'cancel').trigger('click')
  await nextTick()
  expect(logout).toHaveBeenCalledOnce()
  expect(factorState.factor).toBe('')
  expect(wrapper.find('[data-field="factor"]').exists()).toBe(false)
  expect(wrapper.find('[data-field="subject"] input').exists()).toBe(true)
})
test('cancelling MFA clears a typed code before logout settles, even on failure', async () => {
  const store = useAuthStore()
  mfa(store)
  let reject!: (reason: unknown) => void
  vi.spyOn(store, 'logout').mockReturnValue(
    new Promise((_, fail) => {
      reject = fail
    }),
  )
  const wrapper = await render()
  await fieldInput(wrapper, 'factor').setValue('012345')
  await namedButton(wrapper, 'cancel').trigger('click')
  expect((fieldInput(wrapper, 'factor').element as HTMLInputElement).value).toBe('')
  reject(new Error('desktop unavailable'))
  await flushPromises()
  expect((fieldInput(wrapper, 'factor').element as HTMLInputElement).value).toBe('')
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
})

test('signed-in dashboard shows real account data instead of login forms or credentials', async () => {
  const store = useAuthStore()
  store.snapshot = {
    ...store.snapshot,
    status: 'signed-in',
    accessToken: 'must-not-render',
    sessionId: 'session-id',
  }
  store.user = {
    id: 'user-id',
    sessionId: 'session-id',
    clientType: 'DESKTOP',
    twoFactorEnabled: true,
    nickname: 'Nexus_123',
    email: null,
  }
  store.authorization = { roles: ['USER'], permissions: ['sessions.read-self'] }
  const wrapper = await render()
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.get('section').attributes('aria-label')).toBe('account.dashboard')
  expect(wrapper.get('section > .grid').classes()).toContain('grid-cols-2')
  expect(wrapper.text()).toContain('Nexus_123')
  expect(wrapper.text()).not.toContain('user-id')
  expect(wrapper.text()).not.toContain('session-id')
  expect(wrapper.text()).not.toContain('sessions.read-self')
  expect(wrapper.text()).not.toContain('USER')
  expect(wrapper.text()).toContain('account.emailUnbound')
  expect(wrapper.text()).toContain('LV0')
  expect(wrapper.text()).toContain('account.dailyCheckIn')
  expect(wrapper.text()).not.toContain('must-not-render')
  expect(wrapper.text()).not.toContain('account.dashboardHint')
  expect(
    wrapper
      .findAll('button')
      .some((button) => ['account.reload', 'account.reloadExperience'].includes(button.text())),
  ).toBe(false)
  expect(namedButton(wrapper, 'logout').exists()).toBe(true)
  store.snapshot = { ...store.snapshot, status: 'signed-out', accessToken: null }
  await nextTick()
  expect(wrapper.find('form').exists()).toBe(true)
  expect(wrapper.text()).not.toContain('user-id')
})
test('viewing user id only shows it in a modal after click', async () => {
  const store = useAuthStore()
  store.snapshot = {
    ...store.snapshot,
    status: 'signed-in',
    accessToken: 'token',
    sessionId: 'session-id',
  }
  store.user = {
    id: 'user-id',
    sessionId: 'session-id',
    clientType: 'DESKTOP',
    twoFactorEnabled: true,
    nickname: 'Nexus_123',
    email: null,
  }
  const wrapper = await render()
  expect(wrapper.text()).not.toContain('user-id')
  await namedButton(wrapper, 'viewId').trigger('click')
  await nextTick()
  expect(wrapper.text()).toContain('user-id')
  await namedButton(wrapper, 'copy').trigger('click')
  expect(mocks.writeText).toHaveBeenCalledExactlyOnceWith('user-id')
})

test('device name is detected automatically and remains editable', async () => {
  const wrapper = await render()
  expect((fieldInput(wrapper, 'deviceName').element as HTMLInputElement).value).toBe('Detected PC')
  await fieldInput(wrapper, 'deviceName').setValue('My gaming PC')
  expect((fieldInput(wrapper, 'deviceName').element as HTMLInputElement).value).toBe('My gaming PC')
})
test('late device detection does not overwrite player input', async () => {
  let finish!: (value: { ok: true; data: string }) => void
  mocks.deviceName.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const wrapper = await render()
  await fieldInput(wrapper, 'deviceName').setValue('Custom name')
  finish({ ok: true, data: 'Detected PC' })
  await flushPromises()
  expect((fieldInput(wrapper, 'deviceName').element as HTMLInputElement).value).toBe('Custom name')
})

test('nickname editor validates input and sends normalized nickname only', async () => {
  const store = useAuthStore()
  store.snapshot = {
    ...store.snapshot,
    status: 'signed-in',
    accessToken: 'token',
    sessionId: 'session',
  }
  store.user = {
    id: 'private-id',
    sessionId: 'session',
    clientType: 'DESKTOP',
    twoFactorEnabled: false,
    nickname: 'Nexus_123',
    email: 'player@example.test',
  }
  mocks.saveNickname.mockResolvedValue('Nexus_456')
  const wrapper = await render()
  expect(wrapper.text()).toContain('player@example.test')
  await namedButton(wrapper, 'editNickname').trigger('click')
  await fieldInput(wrapper, 'nickname').setValue('bad name')
  await wrapper.get('form').trigger('submit')
  expect(mocks.saveNickname).not.toHaveBeenCalled()
  await fieldInput(wrapper, 'nickname').setValue('Nexus_456')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.saveNickname).toHaveBeenCalledExactlyOnceWith('Nexus_456')
  expect(wrapper.find('form').exists()).toBe(false)
})
test('daily check-in uses returned award instead of adding experience in the page', async () => {
  const store = useAuthStore()
  store.snapshot = {
    ...store.snapshot,
    status: 'signed-in',
    accessToken: 'token',
    sessionId: 'session',
  }
  mocks.checkIn.mockResolvedValue({
    experience: 100,
    level: 1,
    awardedExperience: 10,
    checkedIn: true,
  })
  const wrapper = await render()
  await namedButton(wrapper, 'checkIn').trigger('click')
  await flushPromises()
  expect(mocks.checkIn).toHaveBeenCalledOnce()
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ color: 'success', title: 'account.checkInDone' }),
  )
})
