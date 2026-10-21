import { beforeEach, expect, it, vi } from 'vitest'
const { request, create } = vi.hoisted(() => {
  const request = vi.fn<(config: unknown) => Promise<unknown>>()
  return {
    request,
    create: vi.fn<(config: unknown) => { request: typeof request }>(() => ({ request })),
  }
})
vi.mock('axios', () => ({
  default: {
    create,
    isAxiosError: (value: unknown) =>
      Boolean(value && typeof value === 'object' && 'isAxiosError' in value),
  },
}))
import { createAuthTransport } from '../transport'
beforeEach(() => request.mockReset())
it('uses a fixed Node transport with no cookies redirects proxy or renderer URL', async () => {
  const transport = createAuthTransport()
  expect(create).toHaveBeenLastCalledWith(
    expect.objectContaining({
      baseURL: 'http://127.0.0.1:3000',
      adapter: 'http',
      maxRedirects: 0,
      proxy: false,
      withCredentials: false,
    }),
  )
  request.mockResolvedValueOnce({ data: { accepted: true } })
  await transport.request(
    'challenge',
    { subject: 'test@example.com' },
    new AbortController().signal,
  )
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      url: '/auth/challenges',
      method: 'POST',
      headers: { Cookie: undefined, Authorization: undefined },
    }),
  )
})
it('never propagates Axios config response body URL or credentials and never retries', async () => {
  const transport = createAuthTransport()
  request.mockRejectedValueOnce({
    config: { data: 'password', headers: { Authorization: 'secret' } },
    response: { data: 'refresh-secret' },
    message: 'https://private.invalid',
  })
  await expect(
    transport.request(
      'refresh',
      { refreshToken: 'secret', clientType: 'DESKTOP' },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ message: 'Account operation failed: network' })
  expect(request).toHaveBeenCalledOnce()
})
it('revokes only the current session via bounded DELETE bearer with no body', async () => {
  const transport = createAuthTransport()
  request.mockResolvedValueOnce({ data: undefined })
  await transport.request('logout', {}, new AbortController().signal, 'access')
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'DELETE',
      url: '/sessions/current',
      data: undefined,
      timeout: 2000,
      headers: { Cookie: undefined, Authorization: 'Bearer access' },
    }),
  )
})

it.each([400, 401, 403, 409, 429, 503])(
  'reports safe HTTP %s without leaking response details or retrying',
  async (status) => {
    request.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status, data: { password: 'secret' } },
      config: { authorization: 'secret' },
    })
    await expect(
      createAuthTransport().request('register', {}, new AbortController().signal),
    ).rejects.toMatchObject({ message: `Account operation failed: http${status}` })
    expect(request).toHaveBeenCalledOnce()
  },
)
