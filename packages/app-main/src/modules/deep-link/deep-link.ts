import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { app } from 'electron'
import { resolve } from 'node:path'
import { sendWhenReady } from '@/modules/window'
import { parseDeepLink } from './deep-link-url'
import type { DeepLinkMessage } from './deep-link-url'

let initialized = false
const pending: DeepLinkMessage[] = []

export function captureDeepLink(url: string): void {
  const message = parseDeepLink(url)
  if (!message) return
  if (!initialized) {
    if (pending.length >= 32) throw new AppError(ERRORS.DEEP_LINK_QUEUE_FULL)
    pending.push(message)
    return
  }
  sendWhenReady(message.channel, message.data)
}

export function initializeDeepLink(): void {
  if (initialized) return
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('scnexus', process.execPath, [resolve(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient('scnexus')
  }
  initialized = true
  for (const message of pending.splice(0)) {
    sendWhenReady(message.channel, message.data)
  }
}
