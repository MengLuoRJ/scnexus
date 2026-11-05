import { AccountError, apiRequest, type ApiAuth } from './internal/client'

export type InboxFilter = 'all' | 'read' | 'unread'
export type InboxBusinessType =
  | 'SYSTEM'
  | 'SERVICE'
  | 'ACTIVITY'
  | 'SUBSCRIPTION'
  | 'SERVICE_LINK'
  | 'ACTIVITY_LINK'
export type InboxNotification = {
  id: string
  title: string
  body: string
  businessType: InboxBusinessType
  businessId: string
  link: string | null
  audience: 'USERS' | 'BROADCAST_EXISTING' | 'BROADCAST_ALL'
  publishedAt: string
  readAt: string | null
}
export type InboxPage = {
  items: InboxNotification[]
  page: number
  limit: number
  hasMore: boolean
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('inbox')
  return value as Record<string, unknown>
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('inbox')
  return value
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new Error('inbox')
  return value
}
function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value)
  )
    throw new Error('inbox')
  return value
}
function timestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    throw new Error('inbox')
  const time = Date.parse(value)
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString() !==
      value.replace(
        /(?:\.(\d{1,3}))?Z$/,
        (_, fraction: string | undefined) => `.${(fraction ?? '').padEnd(3, '0')}Z`,
      )
  )
    throw new Error('inbox')
  return value
}
function notification(value: unknown): InboxNotification {
  const data = record(value)
  if (
    typeof data.businessType !== 'string' ||
    !['SYSTEM', 'SERVICE', 'ACTIVITY', 'SUBSCRIPTION', 'SERVICE_LINK', 'ACTIVITY_LINK'].includes(
      data.businessType,
    ) ||
    typeof data.audience !== 'string' ||
    !['USERS', 'BROADCAST_EXISTING', 'BROADCAST_ALL'].includes(data.audience)
  )
    throw new Error('inbox')
  const link = data.link === null ? null : text(data.link, 1000)
  if (link !== null && !['SERVICE_LINK', 'ACTIVITY_LINK'].includes(String(data.businessType)))
    throw new Error('inbox')
  return {
    id: uuid(data.id),
    title: text(data.title, 160),
    body: text(data.body, 10000),
    businessType: data.businessType as InboxBusinessType,
    businessId: text(data.businessId, 120),
    link,
    audience: data.audience as InboxNotification['audience'],
    publishedAt: timestamp(data.publishedAt),
    readAt: data.readAt === null ? null : timestamp(data.readAt),
  }
}
export async function apiInboxList(
  auth: ApiAuth,
  filter: InboxFilter = 'all',
  page = 1,
  limit = 20,
): Promise<InboxPage> {
  try {
    if (!['all', 'read', 'unread'].includes(filter)) throw new Error('inbox')
    integer(page, 1, 100000)
    integer(limit, 1, 100)
  } catch {
    throw new AccountError('badRequest')
  }
  return apiRequest(
    '/inbox',
    (value) => {
      const data = record(value)
      if (
        !Array.isArray(data.items) ||
        data.items.length > limit ||
        typeof data.hasMore !== 'boolean' ||
        integer(data.page, 1, 100000) !== page ||
        integer(data.limit, 1, 100) !== limit
      )
        throw new Error('inbox')
      return { items: data.items.map(notification), page, limit, hasMore: data.hasMore }
    },
    auth,
    'GET',
    undefined,
    { filter, page: String(page), limit: String(limit) },
  )
}
export const apiInboxUnreadCount = (auth: ApiAuth): Promise<number> =>
  apiRequest('/inbox/unread-count', (value) => integer(record(value).unreadCount), auth)
export async function apiInboxRead(auth: ApiAuth, id: string): Promise<boolean> {
  try {
    uuid(id)
  } catch {
    throw new AccountError('badRequest')
  }
  return apiRequest(
    `/inbox/${id}/read`,
    (value) => {
      const changed = record(value).changed
      if (typeof changed !== 'boolean') throw new Error('inbox')
      return changed
    },
    auth,
    'POST',
    {},
  )
}
export const apiInboxReadAll = (auth: ApiAuth): Promise<number> =>
  apiRequest('/inbox/read-all', (value) => integer(record(value).changed), auth, 'POST', {})
