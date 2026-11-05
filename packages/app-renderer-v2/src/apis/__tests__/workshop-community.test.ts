import { beforeEach, expect, test, vi } from 'vitest'
import type { AxiosRequestConfig } from 'axios'
import * as api from '../workshop-community'
const mocks = vi.hoisted(() => ({
  request: vi.fn<(config: AxiosRequestConfig) => Promise<{ data: unknown }>>(),
}))
vi.mock('axios', () => ({
  default: {
    create: () => ({ request: mocks.request }),
    isAxiosError: (value: unknown) =>
      Boolean(value && typeof value === 'object' && 'isAxiosError' in value),
  },
}))
const id = '11111111-1111-4111-8111-111111111111'
const auth = {
  getSnapshot: () =>
    ({ epoch: 1, sessionId: id, status: 'signed-in', accessToken: 'test-only' }) as never,
  refresh: vi.fn<() => Promise<void>>(),
}
const review = {
  id,
  projectScnid: 1,
  reviewerNickname: 'Player',
  recommended: false,
  text: 'Hello',
  textHtml: '<p>Hello</p>',
  createdAt: '2026-11-05T00:00:00Z',
  updatedAt: '2026-11-05T00:00:00Z',
}
const privateReview = { ...review, textVisible: false, visibilitySource: 'PENDING', revision: 0 }
const page = (items: unknown[], limit = 20) => ({ items, total: items.length, page: 1, limit })
beforeEach(() => vi.resetAllMocks())
test('public summary and reviews use exact unauthenticated routes and raw summary fields', async () => {
  const summary = {
    totalReviews: 3,
    positiveReviews: 2,
    negativeReviews: 1,
    positiveRate: 66.66,
    recommendation: '褒贬不一',
    favoriteCount: 0,
  }
  mocks.request.mockResolvedValueOnce({ data: summary })
  expect(await api.apiWorkshopCommunitySummary(1)).toEqual(summary)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ url: '/workshop/projects/1/community-summary', headers: {} }),
  )
  mocks.request.mockResolvedValueOnce({ data: page([review]) })
  expect((await api.apiWorkshopReviews(1)).items).toEqual([review])
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      url: '/workshop/projects/1/reviews',
      params: { page: '1', limit: '20' },
      headers: {},
    }),
  )
})
test('private review null, POST and full replacement PATCH preserve omitted text', async () => {
  mocks.request.mockResolvedValueOnce({ data: null })
  expect(await api.apiWorkshopMyReview(auth, 1)).toBeNull()
  mocks.request.mockResolvedValue({ data: privateReview })
  await api.apiWorkshopCreateReview(auth, 1, { recommended: false, text: 'Hello' })
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ method: 'POST', data: { recommended: false, text: 'Hello' } }),
  )
  await api.apiWorkshopUpdateReview(auth, 1, { expectedRevision: 0, recommended: false })
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ method: 'PATCH', data: { expectedRevision: 0, recommended: false } }),
  )
})
test('favorites use GET/PUT/DELETE with no body and private list defaults to twelve', async () => {
  mocks.request.mockResolvedValue({ data: { scnid: 1, favorited: false } })
  await api.apiWorkshopFavorite(auth, 1)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ method: 'GET', url: '/workshop/projects/1/favorite' }),
  )
  mocks.request.mockResolvedValueOnce({ data: { scnid: 1, favorited: true } })
  await api.apiWorkshopSetFavorite(auth, 1, true)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ method: 'PUT', data: undefined }),
  )
  await api.apiWorkshopSetFavorite(auth, 1, false)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ method: 'DELETE', data: undefined }),
  )
  const favorite = {
    scnid: 1,
    title: 'Title',
    description: '',
    slug: null,
    createdAt: review.createdAt,
  }
  mocks.request.mockResolvedValueOnce({ data: page([favorite], 12) })
  expect((await api.apiWorkshopFavorites(auth)).items).toEqual([favorite])
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ url: '/workshop/my-favorites', params: { page: '1', limit: '12' } }),
  )
})
test('author moderation preserves all private states and visibility writes only CAS and visibility', async () => {
  mocks.request.mockResolvedValueOnce({ data: page([privateReview]) })
  expect((await api.apiWorkshopReviewModeration(auth, 1)).items).toEqual([privateReview])
  mocks.request.mockResolvedValueOnce({
    data: { ...privateReview, revision: 1, textVisible: true, visibilitySource: 'AUTHOR' },
  })
  await api.apiWorkshopReviewVisibility(auth, 1, id, 0, true)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'PATCH',
      url: `/workshop/projects/1/reviews/${id}/visibility`,
      data: { expectedRevision: 0, visible: true },
    }),
  )
})
test.each([0, -1, 1.5, 2147483648, NaN])('rejects invalid project id %s before HTTP', (id) => {
  expect(() => api.apiWorkshopCommunitySummary(id)).toThrow('badRequest')
  expect(mocks.request).not.toHaveBeenCalled()
})
test.each([
  [0, 20],
  [1, 101],
  [1, 1.5],
  [2147483648, 20],
])('rejects invalid pagination %s/%s', (page, limit) => {
  expect(() => api.apiWorkshopReviews(1, page, limit)).toThrow('badRequest')
  expect(mocks.request).not.toHaveBeenCalled()
})
test('rejects malformed, oversized, unknown write fields without sending requests', () => {
  for (const input of [
    { recommended: 'yes' },
    { recommended: true, text: 'a'.repeat(1001) },
    { recommended: true, userId: id },
  ])
    expect(() => api.apiWorkshopCreateReview(auth, 1, input as never)).toThrow('badRequest')
  expect(() =>
    api.apiWorkshopUpdateReview(auth, 1, { recommended: true, expectedRevision: -1 }),
  ).toThrow('badRequest')
  expect(() => api.apiWorkshopSetFavorite(auth, 1, 1 as never)).toThrow('badRequest')
  expect(mocks.request).not.toHaveBeenCalled()
})
test.each([
  { ...review, userId: id },
  { ...review, projectScnid: 2 },
  { ...review, textHtml: '<p onclick="x">Hello</p>' },
  { ...review, textHtml: '<a href="https://example.com">Hello</a>' },
  { ...review, recommended: 1 },
])('rejects unsafe or non-contract public reviews', async (item) => {
  mocks.request.mockResolvedValueOnce({ data: page([item]) })
  await expect(api.apiWorkshopReviews(1)).rejects.toMatchObject({ kind: 'invalidResponse' })
})
test('validates summary counts, recommendation thresholds and pagination echoes', async () => {
  for (const data of [
    {
      totalReviews: 0,
      positiveReviews: 0,
      negativeReviews: 0,
      positiveRate: 0,
      recommendation: '暂无评价',
      favoriteCount: 0,
    },
    {
      totalReviews: 50,
      positiveReviews: 48,
      negativeReviews: 2,
      positiveRate: 96,
      recommendation: '好评如潮',
      favoriteCount: 0,
    },
  ]) {
    mocks.request.mockResolvedValueOnce({ data })
    await expect(api.apiWorkshopCommunitySummary(1)).rejects.toMatchObject({
      kind: 'invalidResponse',
    })
  }
  mocks.request.mockResolvedValueOnce({ data: { ...page([review]), page: 2 } })
  await expect(api.apiWorkshopReviews(1)).rejects.toMatchObject({ kind: 'invalidResponse' })
})
test('conflicting writes are never retried or refreshed', async () => {
  mocks.request.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409 } })
  await expect(api.apiWorkshopReviewVisibility(auth, 1, id, 0, true)).rejects.toMatchObject({
    kind: 'conflict',
  })
  expect(mocks.request).toHaveBeenCalledOnce()
  expect(auth.refresh).not.toHaveBeenCalled()
})
