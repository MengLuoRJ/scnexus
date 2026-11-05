import type { InboxNotification } from '../../apis/inbox'
export function inboxNavigation(
  message: Pick<InboxNotification, 'businessType' | 'link'>,
): { kind: 'internal' | 'external'; target: string } | null {
  const link = message.link
  if (!link || link.length > 1000) return null
  if (message.businessType === 'SERVICE_LINK') {
    if (
      !/^\/(?:account|workshop(?:\/[1-9]\d*)?|downloads|creator|uploads|campaign|customize|weekly-mutations|settings|replays)$/.test(
        link,
      )
    )
      return null
    return { kind: 'internal', target: link }
  }
  if (
    message.businessType !== 'ACTIVITY_LINK' ||
    /[\s\\]/u.test(link) ||
    !/^https:\/\/[^/?#@]+(?:[/?#]|$)/i.test(link)
  )
    return null
  try {
    const url = new URL(link)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null
    return { kind: 'external', target: url.href }
  } catch {
    return null
  }
}
