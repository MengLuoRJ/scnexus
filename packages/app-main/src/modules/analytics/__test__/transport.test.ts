import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const { post, create } = vi.hoisted(() => {
  const post =
    vi.fn<
      (path: string, body: unknown, config: { timeout: number }) => Promise<{ data: unknown }>
    >()
  return { post, create: vi.fn<(options: unknown) => { post: typeof post }>(() => ({ post })) }
})
vi.mock('axios', () => ({
  default: {
    create,
    isAxiosError: (value: unknown) =>
      Boolean(value && typeof value === 'object' && 'isAxiosError' in value),
  },
}))
import { createAnalyticsTransport } from '../transport'
afterEach(() => vi.unstubAllEnvs())
it('injects the deployment API origin into analytics', () => {
  vi.stubEnv('VITE_SCNEXUS_API_ORIGIN', 'https://backend.example.invalid')
  createAnalyticsTransport()
  expect(create).toHaveBeenLastCalledWith(
    expect.objectContaining({ baseURL: 'https://backend.example.invalid' }),
  )
})
beforeEach(() => {
  post.mockReset()
  create.mockClear()
})
it('uses only fixed Node HTTP with bounded requests, no cookies, redirects or proxy', async () => {
  const transport = createAnalyticsTransport()
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      baseURL: 'http://127.0.0.1:3000',
      adapter: 'http',
      timeout: 5000,
      proxy: false,
      maxRedirects: 0,
      withCredentials: false,
    }),
  )
  post.mockResolvedValue({ data: { accepted: true } })
  const signal = new AbortController().signal
  await transport.request(
    'heartbeat-authenticated',
    { visitorToken: 'visitor', clientId: 'uuid' },
    signal,
    'access',
  )
  expect(post).toHaveBeenCalledWith(
    '/analytics/presence/authenticated/heartbeat',
    { visitorToken: 'visitor', clientId: 'uuid' },
    { signal, timeout: 5000, headers: { Cookie: undefined, Authorization: 'Bearer access' } },
  )
})
it.each([
  'register-anonymous',
  'register-authenticated',
  'heartbeat-anonymous',
  'heartbeat-authenticated',
] as const)('silently sanitizes %s errors and never retries', async (operation) => {
  post.mockRejectedValue({
    config: { headers: { Authorization: 'secret' } },
    response: { data: 'private' },
  })
  await expect(
    createAnalyticsTransport().request(operation, {}, new AbortController().signal),
  ).rejects.toMatchObject({ kind: 'network', message: 'Analytics request failed' })
  expect(post).toHaveBeenCalledTimes(1)
})
