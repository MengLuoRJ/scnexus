import { beforeEach, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive, nextTick } from 'vue'
const mocks = vi.hoisted(() => ({
  get: vi.fn<() => Promise<unknown>>(),
  redeem: vi.fn<(auth: unknown, code: string) => Promise<unknown>>(),
}))
const auth = reactive({
  signedIn: true,
  snapshot: { epoch: 1, sessionId: 'session' as string | null },
  authorization: {
    permissions: [
      'workshop.projects.create',
      'workshop.projects.manage-self',
      'workshop.uploads.manage-self',
    ],
  },
  httpAuth: {},
  loadAccount: vi.fn<() => Promise<void>>(async () => {}),
})
const content = reactive({ enabled: true })
vi.mock('../auth', () => ({ useAuthStore: () => auth }))
vi.mock('../content-center', () => ({ useContentCenterStore: () => content }))
vi.mock('../../apis/creator', () => ({
  apiCreatorState: mocks.get,
  apiCreatorRedeem: mocks.redeem,
}))
import { useCreatorStore } from '../creator'
beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  auth.signedIn = true
  auth.snapshot.epoch = 1
  auth.snapshot.sessionId = 'session'
  content.enabled = true
  auth.authorization.permissions = [
    'workshop.projects.create',
    'workshop.projects.manage-self',
    'workshop.uploads.manage-self',
  ]
})
test('qualification is not inferred from permissions and disabled Workshop removes access', async () => {
  mocks.get.mockResolvedValue({ userId: 'user', state: 'NONE', source: null })
  const store = useCreatorStore()
  await store.load()
  expect(store.active).toBe(false)
  mocks.get.mockResolvedValue({ userId: 'user', state: 'ACTIVE', source: 'INVITATION' })
  await store.load()
  expect(store.active).toBe(true)
  content.enabled = false
  await nextTick()
  expect(store.active).toBe(false)
  expect(store.state).toBeNull()
})
test('sign-out prevents late qualification response from restoring creator access', async () => {
  let resolve!: (value: unknown) => void
  mocks.get.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes
      }),
  )
  const store = useCreatorStore()
  const pending = store.load()
  auth.signedIn = false
  auth.snapshot.epoch++
  await nextTick()
  resolve({ userId: 'user', state: 'ACTIVE', source: 'INVITATION' })
  await pending
  expect(store.state).toBeNull()
  expect(store.active).toBe(false)
})
test('redeeming reloads authorization and does not grant access while permissions are missing', async () => {
  auth.authorization.permissions = []
  mocks.redeem.mockResolvedValue({ userId: 'user', state: 'ACTIVE', source: 'INVITATION' })
  const store = useCreatorStore()
  await store.redeem('creator_code')
  expect(auth.loadAccount).toHaveBeenCalledOnce()
  expect(store.active).toBe(false)
})
