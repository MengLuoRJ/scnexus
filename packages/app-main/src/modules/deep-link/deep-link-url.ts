import type { DeepLinkWorkshop } from '@scnexus/app-shared/types/desktop.type'

export type DeepLinkMessage =
  | {
      channel: 'deeplink:authentication'
      data: { access_token: string | null; refresh_token: string | null }
    }
  | { channel: 'deeplink:workshop'; data: DeepLinkWorkshop }

export function parseDeepLink(input: string): DeepLinkMessage | undefined {
  if (typeof input !== 'string') return
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return
  }
  if (url.protocol !== 'scnexus:' || url.username || url.password || url.port) return
  if (url.hostname === 'authentication') {
    return {
      channel: 'deeplink:authentication',
      data: {
        access_token: url.searchParams.get('access_token'),
        refresh_token: url.searchParams.get('refresh_token'),
      },
    }
  }
  if (url.hostname === 'workshop') {
    // Match the original URL so URL normalization cannot hide malformed paths.
    const match = /^scnexus:\/\/workshop\/([1-9]\d*)(?:\?download=(true|false))?$/.exec(input)
    if (!match || match[0] !== input) return
    const scnid = Number(match[1])
    if (!Number.isInteger(scnid) || scnid > 2147483647) return
    return {
      channel: 'deeplink:workshop',
      data: { scnid, download: match[2] === 'true' },
    }
  }
}
