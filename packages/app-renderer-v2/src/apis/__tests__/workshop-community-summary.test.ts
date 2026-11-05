import { expect, test, vi } from 'vitest'
import { apiWorkshopCommunitySummary } from '../workshop-community'
const mocks = vi.hoisted(() => ({ request: vi.fn<() => Promise<{ data: unknown }>>() }))
vi.mock('axios', () => ({ default: { create: () => ({ request: mocks.request }) } }))
test.each([
  [0, 0, '暂无评价'],
  [1, 1, '好评'],
  [49, 49, '好评'],
  [50, 48, '特别好评'],
  [100, 95, '好评如潮'],
  [100, 94, '特别好评'],
  [100, 80, '特别好评'],
  [100, 79, '多半好评'],
  [100, 70, '多半好评'],
  [100, 69, '褒贬不一'],
  [100, 40, '褒贬不一'],
  [100, 39, '多半差评'],
  [100, 20, '多半差评'],
  [100, 19, '差评如潮'],
  [99, 0, '特别差评'],
  [49, 0, '差评'],
  [10001, 9500, '特别好评'],
])(
  'validates raw recommendation for %s total / %s positive',
  async (totalReviews, positiveReviews, recommendation) => {
    const summary = {
      totalReviews,
      positiveReviews,
      negativeReviews: totalReviews - positiveReviews,
      positiveRate: totalReviews
        ? Math.floor((positiveReviews * 10000) / totalReviews) / 100
        : null,
      recommendation,
      favoriteCount: 17,
    }
    mocks.request.mockResolvedValueOnce({ data: summary })
    expect(await apiWorkshopCommunitySummary(1)).toEqual(summary)
  },
)
