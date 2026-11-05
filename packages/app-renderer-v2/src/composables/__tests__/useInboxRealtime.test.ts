import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { effectScope, reactive, type EffectScope } from 'vue'
import { useInboxRealtime } from '../useInboxRealtime'
const mocks = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  services: {} as Record<string, unknown>,
}))
vi.mock('../../stores/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('../../stores/content-center', () => ({ useContentCenterStore: () => mocks.services }))
class MockSocket {
  static instances: MockSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  send = vi.fn<(message: string) => void>()
  close = vi.fn<() => void>()
  constructor(readonly url: string) {
    MockSocket.instances.push(this)
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
  end(code = 1006) {
    this.onclose?.({ code })
  }
}
let scope: EffectScope
let auth: {
  signedIn: boolean
  snapshot: { epoch: number; sessionId: string | null; accessToken: string | null }
  user: { id: string } | null
  httpAuth: { refresh: ReturnType<typeof vi.fn<() => Promise<void>>> }
}
let services: { officialServicesEnabled: boolean }
function start() {
  const changed = vi.fn<() => void>()
  scope = effectScope()
  const result = scope.run(() => useInboxRealtime(changed))!
  return { changed, ...result }
}
const latest = () => MockSocket.instances.at(-1)!
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', MockSocket)
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  MockSocket.instances = []
  auth = reactive({
    signedIn: true,
    snapshot: { epoch: 1, sessionId: 'session-1', accessToken: 'access-only' },
    user: { id: 'user-1' },
    httpAuth: { refresh: vi.fn<() => Promise<void>>().mockResolvedValue() },
  })
  services = reactive({ officialServicesEnabled: true })
  mocks.auth = auth
  mocks.services = services
})
afterEach(() => {
  scope?.stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
test('uses exact configured origin/path, first-frame access-only auth and HTTP resync on ready', () => {
  const { status, changed } = start()
  expect(status.value).toBe('connecting')
  const ws = latest()
  const url = new URL(ws.url)
  expect(url.pathname).toBe('/ws/notifications')
  expect(url.search).toBe('')
  expect(url.hash).toBe('')
  expect(['ws:', 'wss:']).toContain(url.protocol)
  expect(ws.send).not.toHaveBeenCalled()
  ws.onopen?.()
  expect(ws.send).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({ type: 'auth', accessToken: 'access-only' }),
  )
  ws.message({ type: 'ready' })
  expect(status.value).toBe('connected')
  expect(changed).toHaveBeenCalledOnce()
  ws.message({ type: 'pong' })
  expect(changed).toHaveBeenCalledOnce()
})
test('deduplicates bounded event IDs, debounces hints and never projects notification state', () => {
  const { changed } = start()
  latest().message({ type: 'ready' })
  latest().message({ type: 'inbox.changed', eventId: 'one', reason: 'published' })
  latest().message({ type: 'inbox.changed', eventId: 'one', reason: 'read' })
  latest().message({ type: 'inbox.changed', eventId: 'two', reason: 'read' })
  vi.advanceTimersByTime(199)
  expect(changed).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(1)
  expect(changed).toHaveBeenCalledTimes(2)
  for (let index = 0; index < 257; index++)
    latest().message({ type: 'inbox.changed', eventId: `event-${index}`, reason: 'read' })
  vi.advanceTimersByTime(200)
  latest().message({ type: 'inbox.changed', eventId: 'one', reason: 'read' })
  vi.advanceTimersByTime(200)
  expect(changed).toHaveBeenCalledTimes(4)
})
test.each([
  { type: 'ready', extra: true },
  { type: 'auth', accessToken: 'other' },
  { type: 'inbox.changed', eventId: '', reason: 'read' },
  { type: 'inbox.changed', eventId: 'x'.repeat(4097), reason: 'read' },
  { type: 'inbox.changed', eventId: 'one', reason: 'delete' },
  { type: 'inbox.changed', eventId: 1, reason: 'read' },
  { type: 'inbox.changed', eventId: 'one', reason: 'read', body: 'forbidden' },
  [],
  null,
])('rejects invalid protocol message %j without callback/reconnect storms', (data) => {
  const { changed, status } = start()
  latest().message({ type: 'ready' })
  latest().message(data)
  expect(status.value).toBe('unavailable')
  expect(latest().close).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(60000)
  expect(changed).toHaveBeenCalledOnce()
  expect(MockSocket.instances).toHaveLength(1)
})
test.each([
  new Uint8Array([1]),
  '{bad',
  'a'.repeat(4097),
  JSON.stringify({ type: 'unknown', value: '中'.repeat(1400) }),
])('rejects binary, oversized bytes and invalid JSON', (data) => {
  const { changed, status } = start()
  latest().onmessage?.({ data })
  expect(status.value).toBe('unavailable')
  expect(changed).not.toHaveBeenCalled()
})
test('ignores changes before ready', () => {
  const { changed, status } = start()
  latest().message({ type: 'inbox.changed', eventId: 'one', reason: 'read' })
  expect(changed).not.toHaveBeenCalled()
  expect(status.value).toBe('unavailable')
})
test('releases socket and queued callbacks on scope disposal and ignores stale handlers', () => {
  const { changed } = start()
  const old = latest()
  const stale = old.onmessage!
  old.message({ type: 'ready' })
  old.message({ type: 'inbox.changed', eventId: 'one', reason: 'read' })
  scope.stop()
  stale({ data: JSON.stringify({ type: 'ready' }) })
  vi.advanceTimersByTime(60000)
  expect(changed).toHaveBeenCalledOnce()
  expect(old.close).toHaveBeenCalledOnce()
  expect(MockSocket.instances).toHaveLength(1)
})
test('releases on account/epoch/session changes, reconnects on access updates and service re-enable', () => {
  const { status } = start()
  const old = latest()
  auth.snapshot.accessToken = 'new-access'
  expect(old.close).toHaveBeenCalledOnce()
  latest().onopen?.()
  expect(latest().send).toHaveBeenCalledWith(
    JSON.stringify({ type: 'auth', accessToken: 'new-access' }),
  )
  auth.snapshot.epoch++
  auth.snapshot.sessionId = 'session-2'
  auth.user = { id: 'user-2' }
  expect(MockSocket.instances).toHaveLength(5)
  services.officialServicesEnabled = false
  expect(latest().close).toHaveBeenCalledOnce()
  expect(status.value).toBe('unavailable')
  vi.advanceTimersByTime(60000)
  expect(MockSocket.instances).toHaveLength(5)
  services.officialServicesEnabled = true
  expect(MockSocket.instances).toHaveLength(6)
  auth.signedIn = false
  expect(latest().close).toHaveBeenCalledOnce()
})
test('does not connect when disabled, signed out or WebSocket is absent', () => {
  services.officialServicesEnabled = false
  start()
  expect(MockSocket.instances).toHaveLength(0)
  auth.signedIn = false
  services.officialServicesEnabled = true
  expect(MockSocket.instances).toHaveLength(0)
  vi.stubGlobal('WebSocket', undefined)
  auth.signedIn = true
  expect(MockSocket.instances).toHaveLength(0)
})
test('uses jittered exponential backoff capped at 30s and syncs after reconnect', () => {
  const { status, changed } = start()
  for (const wait of [750, 1500, 3000, 6000, 12000, 22500, 22500]) {
    const count = MockSocket.instances.length
    latest().end(1013)
    expect(status.value).toBe('unavailable')
    vi.advanceTimersByTime(wait - 1)
    expect(MockSocket.instances).toHaveLength(count)
    vi.advanceTimersByTime(1)
    expect(MockSocket.instances).toHaveLength(count + 1)
  }
  latest().message({ type: 'ready' })
  expect(changed).toHaveBeenCalledOnce()
})
test('handshake timeout reconnects, but disabling cancels pending backoff', () => {
  start()
  const old = latest()
  vi.advanceTimersByTime(10000)
  expect(old.close).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(750)
  expect(MockSocket.instances).toHaveLength(2)
  latest().end()
  services.officialServicesEnabled = false
  vi.advanceTimersByTime(60000)
  expect(MockSocket.instances).toHaveLength(2)
})
test('1008 recovers once via existing HTTP auth and never refreshes over websocket', async () => {
  const { status } = start()
  auth.httpAuth.refresh.mockImplementation(async () => {
    auth.snapshot.accessToken = 'refreshed'
  })
  latest().end(1008)
  await vi.advanceTimersByTimeAsync(0)
  expect(auth.httpAuth.refresh).toHaveBeenCalledOnce()
  expect(MockSocket.instances).toHaveLength(2)
  latest().onopen?.()
  expect(latest().send).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({ type: 'auth', accessToken: 'refreshed' }),
  )
  latest().message({ type: 'ready' })
  latest().end(1008)
  await vi.advanceTimersByTimeAsync(60000)
  expect(auth.httpAuth.refresh).toHaveBeenCalledOnce()
  expect(MockSocket.instances).toHaveLength(2)
  expect(status.value).toBe('unavailable')
})
test('failed recovery is unavailable and never loops', async () => {
  const { status } = start()
  auth.httpAuth.refresh.mockRejectedValue(new Error('offline'))
  latest().end(1008)
  await vi.advanceTimersByTimeAsync(60000)
  expect(status.value).toBe('unavailable')
  expect(auth.httpAuth.refresh).toHaveBeenCalledOnce()
  expect(MockSocket.instances).toHaveLength(1)
})
test('late recovery cannot resurrect a disposed or changed session', async () => {
  start()
  let finish!: () => void
  auth.httpAuth.refresh.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve
    }),
  )
  latest().end(1008)
  scope.stop()
  finish()
  await vi.advanceTimersByTimeAsync(60000)
  expect(MockSocket.instances).toHaveLength(1)
})
