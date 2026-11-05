import { beforeEach, expect, test, vi } from 'vitest'
import type { AxiosRequestConfig } from 'axios'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
import { apiInboxList, apiInboxRead, apiInboxReadAll, apiInboxUnreadCount } from '../inbox'
import type { InboxFilter } from '../inbox'
const mocks = vi.hoisted(() => ({
  request: vi.fn<(config: AxiosRequestConfig) => Promise<{ data: unknown }>>(),
}))
vi.mock('axios', () => ({
  default: {
    create: () => ({ request: mocks.request }),
    isAxiosError: (error: unknown) =>
      Boolean(error && typeof error === 'object' && 'isAxiosError' in error),
  },
}))
const snapshot: AuthSnapshot = {
  status: 'signed-in',
  epoch: 1,
  version: 1,
  sessionId: 'session',
  accessToken: 'access',
  accessExpiresAt: 10000,
  sessionExpiresAt: null,
  mfaExpiresAt: null,
}
const auth = {
  getSnapshot: () => snapshot,
  refresh: vi.fn<() => Promise<void>>(),
  invalidate: vi.fn<() => Promise<void>>(),
}
const item = {
  id: '11111111-1111-4111-8111-111111111111',
  title: '维护',
  body: '**提醒**',
  businessType: 'SERVICE_LINK',
  businessId: 'maintenance-1',
  link: '/services/status',
  audience: 'USERS',
  publishedAt: '2026-10-20T08:00:00.000Z',
  readAt: null,
}
const page = { items: [item], page: 1, limit: 20, hasMore: false }
beforeEach(() => {
  vi.resetAllMocks()
  snapshot.epoch = 1
})
test('uses fixed self-only routes, defaults, exact write bodies and projects DTOs', async () => {
  mocks.request.mockResolvedValueOnce({
    data: { ...page, total: 100, items: [{ ...item, secret: 'discard' }] },
  })
  expect(await apiInboxList(auth)).toEqual(page)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      url: '/inbox',
      method: 'GET',
      params: { filter: 'all', page: '1', limit: '20' },
      data: undefined,
    }),
  )
  mocks.request.mockResolvedValueOnce({ data: { unreadCount: 2 } })
  expect(await apiInboxUnreadCount(auth)).toBe(2)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ url: '/inbox/unread-count', method: 'GET' }),
  )
  mocks.request.mockResolvedValueOnce({ data: { changed: true } })
  expect(await apiInboxRead(auth, item.id)).toBe(true)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ url: `/inbox/${item.id}/read`, method: 'POST', data: {} }),
  )
  mocks.request.mockResolvedValueOnce({ data: { changed: 3 } })
  expect(await apiInboxReadAll(auth)).toBe(3)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ url: '/inbox/read-all', method: 'POST', data: {} }),
  )
})
test.each(['read', 'unread'] as const)('supports %s and pagination boundaries', async (filter) => {
  mocks.request.mockResolvedValue({ data: { items: [], page: 100000, limit: 100, hasMore: false } })
  await expect(apiInboxList(auth, filter, 100000, 100)).resolves.toMatchObject({
    page: 100000,
    limit: 100,
  })
})
test.each([
  ['other', 1, 20],
  ['all', 0, 20],
  ['all', 100001, 20],
  ['all', 1.5, 20],
  ['all', 1, 0],
  ['all', 1, 101],
  ['all', 1, NaN],
  ['all', '1', 20],
])('rejects invalid request arguments %j', async (filter, pageNumber, limit) => {
  await expect(
    apiInboxList(auth, filter as InboxFilter, pageNumber as number, limit as number),
  ).rejects.toMatchObject({ kind: 'badRequest' })
  expect(mocks.request).not.toHaveBeenCalled()
})
test.each(['invalid', '../read-all', '11111111-1111-4111-1111-111111111111'])(
  'rejects invalid notification ID %s before sending',
  async (id) => {
    await expect(apiInboxRead(auth, id)).rejects.toMatchObject({ kind: 'badRequest' })
    expect(mocks.request).not.toHaveBeenCalled()
  },
)
test.each([
  { id: 'bad' },
  { title: '' },
  { title: 'a'.repeat(161) },
  { body: 'a'.repeat(10001) },
  { body: ' ' },
  { businessId: 'a'.repeat(121) },
  { businessId: 1 },
  { businessType: 'OTHER' },
  { audience: 'OTHER' },
  { link: '' },
  { link: 'x'.repeat(1001) },
  { businessType: 'SYSTEM' },
  { link: undefined },
  { publishedAt: '2026-02-30T08:00:00.000Z' },
  { publishedAt: '2026-10-20T24:00:00Z' },
  { publishedAt: '2026-10-20' },
  { publishedAt: 123 },
  { readAt: false },
  { readAt: 'invalid' },
])('rejects malformed notification %j', async (change) => {
  mocks.request.mockResolvedValue({ data: { ...page, items: [{ ...item, ...change }] } })
  await expect(apiInboxList(auth)).rejects.toMatchObject({ kind: 'invalidResponse' })
})
test.each([
  null,
  { ...page, page: '1' },
  { ...page, page: 2 },
  { ...page, limit: 21 },
  { ...page, hasMore: 0 },
  { ...page, items: {} },
  { ...page, items: Array(21).fill(item) },
])('rejects malformed page %j', async (data) => {
  mocks.request.mockResolvedValue({ data })
  await expect(apiInboxList(auth)).rejects.toMatchObject({ kind: 'invalidResponse' })
})
test.each([-1, 0.5, '2', Number.MAX_SAFE_INTEGER + 1, null])(
  'rejects malformed counters %j',
  async (value) => {
    mocks.request.mockResolvedValue({ data: { unreadCount: value, changed: value } })
    await expect(apiInboxUnreadCount(auth)).rejects.toMatchObject({ kind: 'invalidResponse' })
    await expect(apiInboxReadAll(auth)).rejects.toMatchObject({ kind: 'invalidResponse' })
  },
)
test.each([0, 1, 'true', null])('requires a real boolean for changed %j', async (changed) => {
  mocks.request.mockResolvedValue({ data: { changed } })
  await expect(apiInboxRead(auth, item.id)).rejects.toMatchObject({ kind: 'invalidResponse' })
})
test('accepts all enums, null navigation, valid timestamps, and idempotent results', async () => {
  for (const businessType of [
    'SYSTEM',
    'SERVICE',
    'ACTIVITY',
    'SUBSCRIPTION',
    'SERVICE_LINK',
    'ACTIVITY_LINK',
  ]) {
    for (const audience of ['USERS', 'BROADCAST_EXISTING', 'BROADCAST_ALL']) {
      mocks.request.mockResolvedValue({
        data: {
          ...page,
          items: [{ ...item, businessType, audience, link: null, readAt: '2026-10-21T08:00:00Z' }],
        },
      })
      await expect(apiInboxList(auth)).resolves.toMatchObject({
        items: [{ businessType, audience }],
      })
    }
  }
  mocks.request.mockResolvedValue({ data: { changed: false } })
  expect(await apiInboxRead(auth, item.id)).toBe(false)
  mocks.request.mockResolvedValue({ data: { changed: 0, unreadCount: 0 } })
  expect(await apiInboxReadAll(auth)).toBe(0)
  expect(await apiInboxUnreadCount(auth)).toBe(0)
})
test('does not retry writes or mask HTTP failures', async () => {
  mocks.request.mockRejectedValue({ isAxiosError: true, response: { status: 401 } })
  await expect(apiInboxReadAll(auth)).rejects.toMatchObject({ kind: 'unauthorized' })
  expect(mocks.request).toHaveBeenCalledOnce()
  expect(auth.refresh).not.toHaveBeenCalled()
  expect(auth.invalidate).toHaveBeenCalledOnce()
})
test('GET refresh and stale identity protection remain in the shared client', async () => {
  mocks.request
    .mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } })
    .mockResolvedValueOnce({ data: { unreadCount: 3 } })
  auth.refresh.mockResolvedValue()
  expect(await apiInboxUnreadCount(auth)).toBe(3)
  expect(auth.refresh).toHaveBeenCalledOnce()
  mocks.request.mockImplementation(async () => {
    snapshot.epoch++
    return { data: page }
  })
  await expect(apiInboxList(auth)).rejects.toMatchObject({ kind: 'stale' })
})
