import type { App } from 'vue'
import {
  init,
  globalHandlersIntegration,
  linkedErrorsIntegration,
  dedupeIntegration,
} from '@sentry/electron/renderer'
import { init as vueInit, vueIntegration } from '@sentry/vue'
import type { TelemetryStatus } from '@scnexus/app-shared/types/desktop.type'
import { ipcTelemetryGetStatus, ipcTelemetryOnStatus } from '../ipcs/telemetry'

export function installRendererTelemetry(app: App) {
  const remembered = new WeakMap<object, string | undefined>()
  let sessionId: string | undefined
  let initialized = false
  let stopped = false
  let revision = 0
  let count = 0
  let since = Date.now()
  let stopStatus: (() => void) | undefined
  let previous: App['config']['errorHandler']
  let installed: App['config']['errorHandler']
  function recordError(error: unknown) {
    if (error && typeof error === 'object' && !remembered.has(error))
      remembered.set(error, sessionId)
  }
  function accept(status: TelemetryStatus) {
    if (stopped) return
    sessionId = status.state === 'enabled' ? status.sessionId : undefined
    if (!sessionId || initialized) return
    initialized = true
    previous = app.config.errorHandler
    try {
      init(
        {
          defaultIntegrations: false,
          integrations: [
            vueIntegration({ app, attachProps: false }),
            globalHandlersIntegration(),
            linkedErrorsIntegration(),
            dedupeIntegration(),
            {
              name: 'SCNexusConsent',
              preprocessEvent(event, hint) {
                const error = hint?.originalException
                const token =
                  error && typeof error === 'object' && remembered.has(error)
                    ? remembered.get(error)
                    : sessionId
                event.tags = { ...event.tags, scnexusConsent: token ?? '' }
              },
            },
          ],
          maxBreadcrumbs: 0,
          dataCollection: { userInfo: false },
          beforeSend(event) {
            if (stopped || !sessionId || event.tags?.scnexusConsent !== sessionId) return null
            if (Date.now() - since >= 60000) {
              count = 0
              since = Date.now()
            }
            if (count >= 20 || !event.exception?.values?.length) return null
            count++
            return {
              type: undefined,
              event_id: event.event_id,
              timestamp: event.timestamp,
              level: 'error',
              platform: 'javascript',
              exception: event.exception,
              tags: { scnexusConsent: sessionId },
            }
          },
        },
        vueInit,
      )
      installed = app.config.errorHandler
    } catch {
      sessionId = undefined
    }
  }
  if (window.scnexus) {
    stopStatus = ipcTelemetryOnStatus((status) => {
      revision++
      accept(status)
    })
    const current = revision
    void ipcTelemetryGetStatus()
      .then((result) => {
        if (!stopped && current === revision && result.ok) accept(result.data)
      })
      .catch(() => {})
  }
  return {
    recordError,
    dispose() {
      stopped = true
      sessionId = undefined
      stopStatus?.()
      if (installed && app.config.errorHandler === installed) app.config.errorHandler = previous
    },
  }
}
