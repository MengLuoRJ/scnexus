import { beforeEach, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive, nextTick } from 'vue'
const mocks = vi.hoisted(() => ({
  get: vi.fn<() => Promise<unknown>>(),
  quota: vi.fn<() => Promise<unknown>>(),
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
  apiCreatorQuota: mocks.quota,
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

test('quota is refreshed rather than reused, and revoked access clears it', async () => {
  mocks.get.mockResolvedValue({ userId: 'user', state: 'ACTIVE', source: 'ADMIN' })
  const store = useCreatorStore()
  await store.load()
  mocks.quota.mockResolvedValueOnce({ userId: 'user', maxProjects: 10, maxPackageBytes: 900000000 })
  expect((await store.loadQuota()).maxProjects).toBe(10)
  mocks.quota.mockResolvedValueOnce({ userId: 'user', maxProjects: 2, maxPackageBytes: 100 })
  expect((await store.loadQuota()).maxProjects).toBe(2)
  expect(mocks.quota).toHaveBeenCalledTimes(2)
  auth.authorization.permissions = []
  expect(store.quota).toBeNull()
})
test('quota failure discards cache and rejects wrong-user responses', async () => {
  mocks.get.mockResolvedValue({ userId: 'user', state: 'ACTIVE', source: 'ADMIN' })
  const store = useCreatorStore()
  await store.load()
  mocks.quota.mockResolvedValueOnce({
    userId: 'other',
    maxProjects: 10,
    maxPackageBytes: 900000000,
  })
  await expect(store.loadQuota()).rejects.toMatchObject({ kind: 'invalidResponse' })
  expect(store.quota).toBeNull()
  expect(store.quotaError).toBeTruthy()
})
test.each(['epoch', 'sessionId'] as const)('late quota cannot cross a changed %s', async (key) => {
  mocks.get.mockResolvedValue({ userId: 'user', state: 'ACTIVE', source: 'ADMIN' })
  const store = useCreatorStore()
  await store.load()
  let resolve!: (value: unknown) => void
  mocks.quota.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes
      }),
  )
  const pending = store.loadQuota()
  const check = pending.catch((error: unknown) => error)
  if (key === 'epoch') auth.snapshot.epoch++
  else auth.snapshot.sessionId = 'new-session'
  resolve({ userId: 'user', maxProjects: 10, maxPackageBytes: 900000000 })
  expect(await check).toMatchObject({ kind: 'stale' })
  expect(store.quota).toBeNull()
})
