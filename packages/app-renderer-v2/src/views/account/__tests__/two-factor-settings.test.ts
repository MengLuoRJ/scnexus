import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { reactive, defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Plugin } from 'vue'
import View from '../TwoFactorSettings.vue'
import { AccountError } from '../../../apis/internal/client'

const mocks = vi.hoisted(() => ({
  enroll: vi.fn<typeof import('../../../apis').apiTwoFactorEnroll>(),
  confirm: vi.fn<typeof import('../../../apis').apiTwoFactorConfirm>(),
  toast: vi.fn<ReturnType<typeof import('@nuxt/ui/composables/useToast').useToast>['add']>(),
  load: vi.fn<ReturnType<typeof import('../../../stores/auth').useAuthStore>['loadAccount']>(),
  rotate: vi.fn<typeof import('../../../apis').apiTwoFactorRotate>(),
  disable: vi.fn<typeof import('../../../apis').apiTwoFactorDisable>(),
  logout: vi.fn<ReturnType<typeof import('../../../stores/auth').useAuthStore>['logout']>(),
  qr: vi.fn<typeof import('uqr').renderSVG>(),
  status: vi.fn<typeof import('../../../apis').apiTwoFactorStatus>(),
  regenerate: vi.fn<typeof import('../../../apis').apiTwoFactorRegenerate>(),
  verify: vi.fn<typeof import('../../../apis').apiTwoFactorVerify>(),
}))
const auth = reactive({
  signedIn: true,
  busy: false,
  user: { twoFactorEnabled: false },
  snapshot: { epoch: 1, sessionId: 'session' },
  httpAuth: {},
  loadAccount: mocks.load,
  logout: mocks.logout,
})
vi.mock('../../../stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('../../../apis', async (original) => ({
  ...(await original<object>()),
  apiTwoFactorEnroll: mocks.enroll,
  apiTwoFactorConfirm: mocks.confirm,
  apiTwoFactorRotate: mocks.rotate,
  apiTwoFactorDisable: mocks.disable,
  apiTwoFactorStatus: mocks.status,
  apiTwoFactorRegenerate: mocks.regenerate,
  apiTwoFactorVerify: mocks.verify,
}))
vi.mock('uqr', () => ({ renderSVG: mocks.qr }))
vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: mocks.toast }) }))
const button = defineComponent({
  props: ['disabled', 'loading', 'type'],
  emits: ['click'],
  template:
    '<button :type="type || \'button\'" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
})
const modal = defineComponent({
  props: ['open'],
  template: '<div v-if="open"><slot name="body" /><slot name="footer" /></div>',
})
const input = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
})
const checkbox = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
})
const field = defineComponent({ props: ['error'], template: '<div><slot />{{ error }}</div>' })
const select = defineComponent({
  props: ['modelValue', 'items'],
  emits: ['update:modelValue'],
  template:
    '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
})
const wrappers: ReturnType<typeof mount>[] = []
function render() {
  const wrapper = mount(View, {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          flatJson: true,
          locale: 'en',
          messages: {
            en: {
              'account.mfaRemaining': 'Remaining {count}',
              'account.mfaVerifiedRemaining': 'Verified {seconds}',
            },
          },
          missingWarn: false,
          fallbackWarn: false,
        }) as unknown as Plugin,
      ],
      stubs: {
        Button: button,
        Modal: modal,
        Input: input,
        Checkbox: checkbox,
        FormField: field,
        Badge: field,
        Alert: true,
        Tooltip: field,
        Select: select,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
const enrollment = {
  secret: 'ABCDEFG2',
  otpauthUri: 'otpauth://totp/SCNexus?secret=ABCDEFG2',
  expiresIn: 600,
}
async function begin(wrapper: ReturnType<typeof render>) {
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'account.mfaEnable')!
    .trigger('click')
  await flushPromises()
}
beforeEach(() => {
  vi.clearAllMocks()
  auth.signedIn = true
  auth.user.twoFactorEnabled = false
  auth.snapshot.epoch = 1
  mocks.enroll.mockResolvedValue(enrollment)
  mocks.confirm.mockResolvedValue(['a'.repeat(32)])
  mocks.load.mockResolvedValue(undefined)
  mocks.rotate.mockResolvedValue(enrollment)
  mocks.disable.mockResolvedValue(undefined)
  mocks.logout.mockResolvedValue(undefined)
  mocks.qr.mockReturnValue('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')
  mocks.status.mockImplementation(async () => ({
    twoFactorEnabled: auth.user.twoFactorEnabled,
    twoFactorVerified: false,
    twoFactorVerifiedAt: null,
    recoveryCodesRemaining: 5,
  }))
  mocks.regenerate.mockResolvedValue(['b'.repeat(32)])
  mocks.verify.mockResolvedValue(300)
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.useRealTimers()
})
test('enrolls, confirms an exact code, shows recovery codes and clears them after saving', async () => {
  const wrapper = render()
  await begin(wrapper)
  expect(wrapper.text()).toContain('ABCDEFG2')
  await wrapper.get('input').setValue('012345')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.confirm).toHaveBeenCalledWith(auth.httpAuth, '012345')
  expect(wrapper.text()).not.toContain('ABCDEFG2')
  expect(wrapper.text()).toContain('a'.repeat(32))
  const done = wrapper.findAll('button').find((item) => item.text() === 'account.mfaDone')!
  expect(done.attributes('disabled')).toBeDefined()
  await wrapper.get('input[type=checkbox]').setValue(true)
  await done.trigger('click')
  expect(wrapper.text()).not.toContain('a'.repeat(32))
  expect(wrapper.text()).toContain('account.mfaEnabled')
})
test('rejects malformed input locally and allows retry after a rejected OTP', async () => {
  const wrapper = render()
  await begin(wrapper)
  await wrapper.get('input').setValue('123')
  await wrapper.get('form').trigger('submit')
  expect(mocks.confirm).not.toHaveBeenCalled()
  mocks.confirm.mockRejectedValueOnce(new AccountError('unauthorized'))
  await wrapper.get('input').setValue('012345')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('account.mfaCodeRejected')
  expect(wrapper.text()).toContain('ABCDEFG2')
  expect(wrapper.get('input').element.value).toBe('')
})
test('discards late enrollment when the session changes', async () => {
  let resolve!: (value: typeof enrollment) => void
  mocks.enroll.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const wrapper = render()
  await begin(wrapper)
  auth.snapshot.epoch++
  resolve(enrollment)
  await flushPromises()
  expect(wrapper.text()).not.toContain('ABCDEFG2')
  expect(wrapper.find('form').exists()).toBe(false)
})
test('expires setup and removes its secret', async () => {
  vi.useFakeTimers()
  const wrapper = render()
  await begin(wrapper)
  await vi.advanceTimersByTimeAsync(600000)
  expect(wrapper.text()).not.toContain('ABCDEFG2')
  expect(wrapper.text()).toContain('account.mfaExpired')
})
test('cancelling clears setup and reopening requests new enrollment', async () => {
  const wrapper = render()
  await begin(wrapper)
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'campaign.cancel')!
    .trigger('click')
  expect(wrapper.text()).not.toContain('ABCDEFG2')
  await begin(wrapper)
  expect(mocks.enroll).toHaveBeenCalledTimes(2)
})
test('discards recovery codes arriving after sign-out', async () => {
  let resolve!: (value: string[]) => void
  mocks.confirm.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const wrapper = render()
  await begin(wrapper)
  await wrapper.get('input').setValue('012345')
  await wrapper.get('form').trigger('submit')
  auth.signedIn = false
  resolve(['a'.repeat(32)])
  await flushPromises()
  expect(wrapper.text()).not.toContain('a'.repeat(32))
  expect(mocks.load).not.toHaveBeenCalled()
})
test('explains recent-login enrollment requirements without exposing server errors', async () => {
  mocks.enroll.mockRejectedValueOnce(new AccountError('forbidden'))
  const wrapper = render()
  await begin(wrapper)
  expect(wrapper.find('form').exists()).toBe(false)
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ description: 'account.mfaRecentLogin' }),
  )
})
test('already enabled users cannot enroll again', () => {
  auth.user.twoFactorEnabled = true
  const wrapper = render()
  expect(wrapper.text()).toContain('account.mfaEnabled')
  expect(wrapper.findAll('button').some((item) => item.text() === 'account.mfaEnable')).toBe(false)
  expect(wrapper.findAll('button').some((item) => item.text() === 'account.mfaRegenerate')).toBe(
    true,
  )
})
test('renders a local QR and clears it when cancelled', async () => {
  const wrapper = render()
  await begin(wrapper)
  expect(mocks.qr).toHaveBeenCalledWith(
    enrollment.otpauthUri,
    expect.objectContaining({ border: 4, ecc: 'M' }),
  )
  expect(wrapper.get('img').attributes('src')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'campaign.cancel')!
    .trigger('click')
  expect(wrapper.find('img').exists()).toBe(false)
})
test('rotates using the current OTP and confirms the new authenticator before replacing recovery codes', async () => {
  auth.user.twoFactorEnabled = true
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'account.mfaRotate')!
    .trigger('click')
  await wrapper.get('input').setValue('012345')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.rotate).toHaveBeenCalledWith(auth.httpAuth, { code: '012345' })
  expect(mocks.confirm).not.toHaveBeenCalled()
  expect(wrapper.find('img').exists()).toBe(true)
  await wrapper.get('input').setValue('654321')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.confirm).toHaveBeenCalledWith(auth.httpAuth, '654321')
  expect(wrapper.text()).toContain('a'.repeat(32))
  expect(mocks.logout).not.toHaveBeenCalled()
})
test('disables with exactly one recovery code then logs out', async () => {
  auth.user.twoFactorEnabled = true
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'account.mfaDisable')!
    .trigger('click')
  await wrapper.get('select').setValue('recovery')
  await wrapper.get('input').setValue('a'.repeat(32))
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.disable).toHaveBeenCalledWith(auth.httpAuth, { recoveryCode: 'a'.repeat(32) })
  expect(mocks.logout).toHaveBeenCalledOnce()
  expect(wrapper.find('form').exists()).toBe(false)
})
test('failed QR generation keeps manual setup available', async () => {
  mocks.qr.mockImplementationOnce(() => {
    throw new Error('synthetic QR failure')
  })
  const wrapper = render()
  await begin(wrapper)
  expect(wrapper.text()).toContain(enrollment.secret)
  expect(wrapper.find('img').exists()).toBe(false)
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'account.mfaQrFailed' }),
  )
})
test('closing removes the synchronous SVG and its setup secret', async () => {
  const wrapper = render()
  await begin(wrapper)
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'campaign.cancel')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.text()).not.toContain(enrollment.secret)
})
test.each(['rotate', 'disable'] as const)(
  'rejected %s proof leaves protection enabled without logout',
  async (operation) => {
    auth.user.twoFactorEnabled = true
    mocks[operation].mockRejectedValueOnce(new AccountError('unauthorized'))
    const wrapper = render()
    const key = operation === 'rotate' ? 'account.mfaRotate' : 'account.mfaDisable'
    await wrapper
      .findAll('button')
      .find((item) => item.text() === key)!
      .trigger('click')
    await wrapper.get('input').setValue('012345')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('account.mfaFactorRejected')
    expect(wrapper.get('input').element.value).toBe('')
    expect(mocks.logout).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('account.mfaEnabled')
  },
)
test('expired rotation restarts old-factor verification and never calls enroll', async () => {
  vi.useFakeTimers()
  auth.user.twoFactorEnabled = true
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'account.mfaRotate')!
    .trigger('click')
  await wrapper.get('input').setValue('012345')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  await vi.advanceTimersByTimeAsync(600000)
  expect(wrapper.find('img').exists()).toBe(false)
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'account.mfaRestart')!
    .trigger('click')
  expect(wrapper.find('select').exists()).toBe(true)
  expect(mocks.enroll).not.toHaveBeenCalled()
  expect(mocks.confirm).not.toHaveBeenCalled()
})
test.each(['rotate', 'disable'] as const)(
  'discards late %s results after a session switch',
  async (operation) => {
    auth.user.twoFactorEnabled = true
    let resolve!: () => void
    if (operation === 'rotate')
      mocks.rotate.mockReturnValueOnce(
        new Promise((done) => {
          resolve = () => done(enrollment)
        }),
      )
    else
      mocks.disable.mockReturnValueOnce(
        new Promise((done) => {
          resolve = () => done()
        }),
      )
    const wrapper = render()
    const key = operation === 'rotate' ? 'account.mfaRotate' : 'account.mfaDisable'
    await wrapper
      .findAll('button')
      .find((item) => item.text() === key)!
      .trigger('click')
    await wrapper.get('input').setValue('012345')
    await wrapper.get('form').trigger('submit')
    auth.snapshot.epoch++
    resolve()
    await flushPromises()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(mocks.logout).not.toHaveBeenCalled()
    expect(wrapper.find('form').exists()).toBe(false)
  },
)
test('regenerates recovery codes without changing the authenticator and requires saving', async () => {
  auth.user.twoFactorEnabled = true
  const wrapper = render()
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'account.mfaRegenerate')!
    .trigger('click')
  await wrapper.get('input').setValue('012345')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.regenerate).toHaveBeenCalledWith(auth.httpAuth, { code: '012345' })
  expect(mocks.rotate).not.toHaveBeenCalled()
  expect(mocks.logout).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('b'.repeat(32))
  const done = wrapper.findAll('button').find((item) => item.text() === 'account.mfaDone')!
  expect(done.attributes('disabled')).toBeDefined()
  await wrapper.get('input[type=checkbox]').setValue(true)
  await done.trigger('click')
  expect(wrapper.text()).not.toContain('b'.repeat(32))
})
test('status failure preserves account actions and can be refreshed', async () => {
  auth.user.twoFactorEnabled = true
  mocks.status.mockRejectedValueOnce(new AccountError('network'))
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('account.mfaStatusUnavailable')
  expect(wrapper.text()).toContain('account.mfaRegenerate')
  await wrapper.get('button[aria-label="account.mfaRefreshStatus"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).not.toContain('account.mfaStatusUnavailable')
  expect(wrapper.text()).toContain('Remaining 5')
})
test('old status cannot overwrite recovery count after regeneration', async () => {
  auth.user.twoFactorEnabled = true
  let resolve!: (value: Awaited<ReturnType<typeof mocks.status>>) => void
  mocks.status.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'account.mfaRegenerate')!
    .trigger('click')
  await wrapper.get('input').setValue('012345')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  resolve({
    twoFactorEnabled: false,
    twoFactorVerified: false,
    twoFactorVerifiedAt: null,
    recoveryCodesRemaining: 0,
  })
  await flushPromises()
  expect(wrapper.text()).toContain('b'.repeat(32))
  expect(wrapper.text()).toContain('account.mfaEnabled')
  expect(wrapper.text()).toContain('Remaining 1')
})
test('late regenerated codes are discarded on sign-out', async () => {
  auth.user.twoFactorEnabled = true
  let resolve!: (value: string[]) => void
  mocks.regenerate.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'account.mfaRegenerate')!
    .trigger('click')
  await wrapper.get('input').setValue('012345')
  await wrapper.get('form').trigger('submit')
  auth.signedIn = false
  resolve(['b'.repeat(32)])
  await flushPromises()
  expect(wrapper.text()).not.toContain('b'.repeat(32))
  expect(wrapper.find('form').exists()).toBe(false)
})
test('verifies the current session using a recovery code without exposing it afterward', async () => {
  auth.user.twoFactorEnabled = true
  const wrapper = render()
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'account.mfaVerifySession')!
    .trigger('click')
  await wrapper.get('select').setValue('recovery')
  await wrapper.get('input').setValue('a'.repeat(32))
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.verify).toHaveBeenCalledWith(auth.httpAuth, { recoveryCode: 'a'.repeat(32) })
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('a'.repeat(32))
  expect(mocks.logout).not.toHaveBeenCalled()
})
test('the actual uqr renderer produces a self-contained SVG with no embedded input markup', async () => {
  const { renderSVG } = await vi.importActual<typeof import('uqr')>('uqr')
  const svg = renderSVG(enrollment.otpauthUri + '&issuer=%3Cscript%3E', { border: 4, ecc: 'M' })
  expect(svg).toContain('<svg')
  expect(svg).not.toContain('<script')
  expect(svg).not.toContain('otpauth:')
})
test('warns when recovery codes are exhausted', async () => {
  auth.user.twoFactorEnabled = true
  mocks.status.mockResolvedValueOnce({
    twoFactorEnabled: true,
    twoFactorVerified: false,
    twoFactorVerifiedAt: null,
    recoveryCodesRemaining: 0,
  })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('Remaining 0')
  expect(wrapper.find('alert-stub[title="account.mfaNoRecovery"]').exists()).toBe(true)
})
test('recent session verification expires instead of remaining verified forever', async () => {
  vi.useFakeTimers()
  auth.user.twoFactorEnabled = true
  mocks.status.mockResolvedValueOnce({
    twoFactorEnabled: true,
    twoFactorVerified: true,
    twoFactorVerifiedAt: new Date().toISOString(),
    recoveryCodesRemaining: 5,
  })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('Verified 300')
  await vi.advanceTimersByTimeAsync(300000)
  expect(wrapper.text()).not.toContain('Verified')
})
test('a future server clock cannot extend recent verification beyond five minutes', async () => {
  vi.useFakeTimers()
  auth.user.twoFactorEnabled = true
  mocks.status.mockResolvedValueOnce({
    twoFactorEnabled: true,
    twoFactorVerified: true,
    twoFactorVerifiedAt: new Date(Date.now() + 3600000).toISOString(),
    recoveryCodesRemaining: 5,
  })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('Verified 300')
  await vi.advanceTimersByTimeAsync(300000)
  expect(wrapper.text()).not.toContain('Verified')
})
test('regeneration rejects malformed recovery input and prevents duplicate submissions', async () => {
  auth.user.twoFactorEnabled = true
  let resolve!: (value: string[]) => void
  mocks.regenerate.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'account.mfaRegenerate')!
    .trigger('click')
  await wrapper.get('select').setValue('recovery')
  await wrapper.get('input').setValue('short')
  await wrapper.get('form').trigger('submit')
  expect(mocks.regenerate).not.toHaveBeenCalled()
  await wrapper.get('input').setValue('a'.repeat(32))
  await wrapper.get('form').trigger('submit')
  await wrapper.get('form').trigger('submit')
  expect(mocks.regenerate).toHaveBeenCalledOnce()
  resolve(['b'.repeat(32)])
  await flushPromises()
  expect(wrapper.text()).toContain('b'.repeat(32))
})
test('uncertain regeneration failure is not reported as success or retried', async () => {
  auth.user.twoFactorEnabled = true
  mocks.regenerate.mockRejectedValueOnce(new AccountError('network'))
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'account.mfaRegenerate')!
    .trigger('click')
  await wrapper.get('input').setValue('012345')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(mocks.regenerate).toHaveBeenCalledOnce()
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ color: 'warning', description: 'account.mfaResultUnknown' }),
  )
  expect(wrapper.text()).not.toContain('b'.repeat(32))
  expect(mocks.logout).not.toHaveBeenCalled()
})
test('authoritative status can supersede a locally confirmed enablement', async () => {
  const wrapper = render()
  await begin(wrapper)
  await wrapper.get('input').setValue('012345')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  await wrapper.get('input[type=checkbox]').setValue(true)
  await wrapper
    .findAll('button')
    .find((item) => item.text() === 'account.mfaDone')!
    .trigger('click')
  mocks.status.mockResolvedValueOnce({
    twoFactorEnabled: false,
    twoFactorVerified: false,
    twoFactorVerifiedAt: null,
    recoveryCodesRemaining: 0,
  })
  await wrapper.get('button[aria-label="account.mfaRefreshStatus"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('account.mfaDisabled')
  expect(wrapper.findAll('button').some((item) => item.text() === 'account.mfaEnable')).toBe(true)
})
