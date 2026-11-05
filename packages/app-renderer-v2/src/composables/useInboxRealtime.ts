import { onScopeDispose, shallowRef, watch, type Ref } from 'vue'
import { resolveServerApiBase } from '@scnexus/app-shared/config/server'
import { useAuthStore } from '../stores/auth'
import { useContentCenterStore } from '../stores/content-center'

export function useInboxRealtime(onChanged: () => void): {
  status: Ref<'connecting' | 'connected' | 'unavailable'>
} {
  const auth = useAuthStore()
  const services = useContentCenterStore()
  const status = shallowRef<'connecting' | 'connected' | 'unavailable'>('unavailable')
  let socket: WebSocket | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let debounce: ReturnType<typeof setTimeout> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let attempts = 0
  let recoveryUsed = false
  let identity = ''
  const seen = new Set<string>()
  function cleanup() {
    generation++
    clearTimeout(retry)
    clearTimeout(debounce)
    clearTimeout(deadline)
    retry = debounce = deadline = undefined
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
      socket.close()
      socket = undefined
    }
    status.value = 'unavailable'
  }
  function notify() {
    try {
      onChanged()
    } catch {
      /* HTTP state and errors belong to the caller. */
    }
  }
  function connect() {
    const current = generation
    const accessToken = auth.snapshot.accessToken
    if (typeof WebSocket === 'undefined' || !accessToken || accessToken.length > 4000) return
    let ws: WebSocket
    try {
      const url = new URL('/ws/notifications', resolveServerApiBase(import.meta.env.DEV))
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(url.href)
    } catch {
      schedule()
      return
    }
    socket = ws
    status.value = 'connecting'
    let ready = false
    const active = () => generation === current && socket === ws
    function invalid() {
      if (!active()) return
      cleanup()
    }
    deadline = setTimeout(() => {
      if (!active()) return
      cleanup()
      schedule()
    }, 10000)
    ws.onopen = () => {
      if (!active()) return
      const message = JSON.stringify({ type: 'auth', accessToken })
      if (new TextEncoder().encode(message).byteLength > 4096) {
        invalid()
        return
      }
      try {
        ws.send(message)
      } catch {
        invalid()
      }
    }
    ws.onmessage = (event: MessageEvent<unknown>) => {
      if (!active()) return
      if (
        typeof event.data !== 'string' ||
        event.data.length > 4096 ||
        new TextEncoder().encode(event.data).byteLength > 4096
      ) {
        invalid()
        return
      }
      let data: Record<string, unknown>
      try {
        const parsed: unknown = JSON.parse(event.data)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error('message')
        data = parsed as Record<string, unknown>
      } catch {
        invalid()
        return
      }
      if (data.type === 'ready' && Object.keys(data).length === 1 && !ready) {
        ready = true
        attempts = 0
        clearTimeout(deadline)
        status.value = 'connected'
        notify()
        return
      }
      if (ready && data.type === 'pong' && Object.keys(data).length === 1) return
      if (
        !ready ||
        data.type !== 'inbox.changed' ||
        Object.keys(data).length !== 3 ||
        typeof data.eventId !== 'string' ||
        !data.eventId.trim() ||
        (data.reason !== 'published' && data.reason !== 'read')
      ) {
        invalid()
        return
      }
      if (seen.has(data.eventId)) return
      seen.add(data.eventId)
      if (seen.size > 256) seen.delete(seen.values().next().value!)
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        if (active()) notify()
      }, 200)
    }
    ws.onerror = () => {
      if (active()) status.value = 'unavailable'
    }
    ws.onclose = (event) => {
      if (!active()) return
      cleanup()
      if (event.code !== 1008) {
        schedule()
        return
      }
      if (recoveryUsed) return
      recoveryUsed = true
      const recoveryGeneration = generation
      // Credentials are refreshed only through the existing HTTP/main-process auth flow.
      void auth.httpAuth
        .refresh()
        .then(() => {
          if (generation === recoveryGeneration) connect()
        })
        .catch(() => {
          if (generation === recoveryGeneration) status.value = 'unavailable'
        })
    }
  }
  function schedule() {
    status.value = 'unavailable'
    const wait = Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5))
    retry = setTimeout(connect, wait * (0.5 + Math.random() * 0.5))
  }
  const stop = watch(
    () =>
      [
        services.officialServicesEnabled,
        auth.signedIn,
        auth.snapshot.epoch,
        auth.snapshot.sessionId,
        auth.user?.id,
        auth.snapshot.accessToken,
      ] as const,
    ([enabled, signedIn, epoch, sessionId, userId]) => {
      cleanup()
      const nextIdentity = JSON.stringify([enabled, epoch, sessionId, userId])
      if (nextIdentity !== identity) {
        identity = nextIdentity
        recoveryUsed = false
        attempts = 0
        seen.clear()
      }
      if (enabled && signedIn && sessionId) connect()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    stop()
    cleanup()
    seen.clear()
  })
  return { status }
}
