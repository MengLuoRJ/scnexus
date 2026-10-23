import { beforeEach, expect, test, vi } from 'vitest'
import type { AxiosRequestConfig } from 'axios'
import { apiWeeklyMutation, apiMutatorCatalog } from '../weekly-mutations'
const mocks = vi.hoisted(() => ({
  request: vi.fn<(config: AxiosRequestConfig) => Promise<{ data: unknown }>>(),
}))
vi.mock('axios', () => ({
  default: { create: () => ({ request: mocks.request }), isAxiosError: () => false },
}))
const factor = {
  id: 'test-factor',
  name: { zhCN: '测试因子', enUS: 'Test factor' },
  description: '<script>text only</script>',
  communityScore: -1,
}
const data = {
  region: 'CN',
  revision: 1,
  updatedAt: '2026-10-20T00:00:00Z',
  asOf: '2026-10-23T00:00:00Z',
  available: true,
  dataStatus: 'projected',
  startsAt: '2026-10-19T00:00:00Z',
  endsAt: '2026-10-26T00:00:00Z',
  lastVerifiedAt: null,
  mutation: {
    id: 'test-week',
    name: { zhCN: '测试主题' },
    map: { id: 'test-map', name: { zhCN: '测试地图' } },
    mutators: [factor],
  },
}
beforeEach(() => vi.clearAllMocks())
test('uses public endpoints without credentials and preserves projected/null semantics', async () => {
  mocks.request.mockResolvedValueOnce({ data })
  expect(await apiWeeklyMutation()).toMatchObject({
    available: true,
    dataStatus: 'projected',
    lastVerifiedAt: null,
  })
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      url: '/sc2/coop/weekly-mutations/current',
      method: 'GET',
      headers: {},
    }),
  )
  mocks.request.mockResolvedValueOnce({ data: { revision: 1, items: [factor] } })
  expect(await apiMutatorCatalog()).toEqual({ revision: 1, items: [factor] })
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ url: '/sc2/coop/mutators', headers: {} }),
  )
})
test('accepts current contract without source and discards legacy source URLs', async () => {
  mocks.request.mockResolvedValueOnce({ data: { ...data, source: 'javascript:legacy' } })
  const result = await apiWeeklyMutation()
  expect(result.available).toBe(true)
  expect(result).not.toHaveProperty('source')
})
test.each(['NO_SCHEDULE', 'OUTSIDE_VALIDITY'])(
  'accepts %s as a normal successful response',
  async (reason) => {
    mocks.request.mockResolvedValueOnce({ data: { ...data, available: false, reason } })
    expect(await apiWeeklyMutation()).toMatchObject({ available: false, reason })
  },
)
test.each([
  { region: 'UNKNOWN' },
  { dataStatus: 'unknown' },
  { endsAt: data.startsAt },
  { asOf: data.endsAt },
  { startsAt: '2026-10-19T00:00:00' },
  { revision: -1 },
  { lastVerifiedAt: 'bad' },
  { mutation: { ...data.mutation, mutators: [] } },
])('rejects invalid weekly projection %j', async (change) => {
  mocks.request.mockResolvedValueOnce({ data: { ...data, ...change } })
  await expect(apiWeeklyMutation()).rejects.toMatchObject({ kind: 'invalidResponse' })
})
test.each([
  { items: [{ ...factor, communityScore: 101 }] },
  { items: [factor, factor] },
  { items: [{ ...factor, description: null }] },
])('rejects invalid mutator directory %j', async ({ items }) => {
  mocks.request.mockResolvedValueOnce({ data: { revision: 1, items } })
  await expect(apiMutatorCatalog()).rejects.toMatchObject({ kind: 'invalidResponse' })
})

test('sends exact region/language query parameters and preserves multilingual display names', async () => {
  mocks.request.mockResolvedValueOnce({
    data: {
      ...data,
      region: 'EU',
      language: 'deDE',
      mutation: {
        ...data.mutation,
        displayName: 'Anzeigename',
        language: 'deDE',
        name: { zhCN: '主题', enUS: 'Fallback', deDE: 'Anzeigename', ruRU: 'Имя' },
      },
    },
  })
  const value = await apiWeeklyMutation('EU', 'deDE')
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ params: { region: 'EU', language: 'deDE' }, headers: {} }),
  )
  expect(value).toMatchObject({
    region: 'EU',
    language: 'deDE',
    mutation: { displayName: 'Anzeigename', name: { ruRU: 'Имя' } },
  })
  mocks.request.mockResolvedValueOnce({ data: { revision: 1, language: 'koKR', items: [factor] } })
  await apiMutatorCatalog('koKR')
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ params: { language: 'koKR' } }),
  )
})
test('rejects mismatched response selections instead of showing the wrong server', async () => {
  mocks.request.mockResolvedValueOnce({ data: { ...data, region: 'NA', language: 'enUS' } })
  await expect(apiWeeklyMutation('EU', 'enUS')).rejects.toMatchObject({ kind: 'invalidResponse' })
  mocks.request.mockResolvedValueOnce({ data: { ...data, language: 'ruRU' } })
  await expect(apiWeeklyMutation()).rejects.toMatchObject({ kind: 'invalidResponse' })
})
