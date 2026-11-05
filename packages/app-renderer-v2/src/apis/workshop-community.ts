import { AccountError, apiRequest, type ApiAuth } from './internal/client'
import { record, scnid, uuid } from './workshop'

export type WorkshopReview = {
  id: string
  projectScnid: number
  reviewerNickname: string
  recommended: boolean
  text: string
  textHtml: string
  createdAt: string
  updatedAt: string
}
export type WorkshopPrivateReview = WorkshopReview & {
  textVisible: boolean
  visibilitySource: 'PENDING' | 'AUTHOR' | 'ADMIN'
  revision: number
}
export type WorkshopFavorite = {
  scnid: number
  title: string
  description: string
  slug: string | null
  createdAt: string
}
export type WorkshopCommunityPage<T> = { items: T[]; total: number; page: number; limit: number }
export type WorkshopCommunitySummary = {
  totalReviews: number
  positiveReviews: number
  negativeReviews: number
  positiveRate: number | null
  recommendation: string
  favoriteCount: number
}
export type WorkshopReviewInput = { recommended: boolean; text?: string }

function exact(value: unknown, keys: string[]) {
  const result = record(value)
  if (Object.keys(result).length !== keys.length || keys.some((key) => !(key in result)))
    throw new Error('response')
  return result
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max)
    throw new Error('response')
  return Number(value)
}
function string(value: unknown, max = Number.MAX_SAFE_INTEGER): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('response')
  return value
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('response')
  return value
}
function date(value: unknown): string {
  const result = string(value)
  if (!Number.isFinite(Date.parse(result))) throw new Error('response')
  return result
}
function request<T>(validate: () => T): T {
  try {
    return validate()
  } catch {
    throw new AccountError('badRequest')
  }
}
function projectPath(id: number) {
  return `/workshop/projects/${request(() => scnid(id))}`
}
const reviewKeys = [
  'id',
  'projectScnid',
  'reviewerNickname',
  'recommended',
  'text',
  'textHtml',
  'createdAt',
  'updatedAt',
]
function review(
  value: unknown,
  id: number,
  privateReview = false,
): WorkshopReview | WorkshopPrivateReview {
  const p = exact(
    value,
    privateReview ? [...reviewKeys, 'textVisible', 'visibilitySource', 'revision'] : reviewKeys,
  )
  if (scnid(p.projectScnid) !== id) throw new Error('response')
  const text = string(p.text, 1000)
  const html = string(p.textHtml)
  // Only the contract's attribute-free formatting tags may cross the rendering boundary.
  if (/<(?!\/?(?:p|br|strong|em|s|u)>)/i.test(html) || (text === '') !== (html === ''))
    throw new Error('response')
  const result: WorkshopReview = {
    id: uuid(p.id),
    projectScnid: id,
    reviewerNickname: string(p.reviewerNickname),
    recommended: boolean(p.recommended),
    text,
    textHtml: html,
    createdAt: date(p.createdAt),
    updatedAt: date(p.updatedAt),
  }
  if (!privateReview) return result
  if (!['PENDING', 'AUTHOR', 'ADMIN'].includes(string(p.visibilitySource)))
    throw new Error('response')
  const textVisible = boolean(p.textVisible)
  if (textVisible && (!text.trim() || p.visibilitySource === 'PENDING')) throw new Error('response')
  return {
    ...result,
    textVisible,
    visibilitySource: p.visibilitySource as WorkshopPrivateReview['visibilitySource'],
    revision: integer(p.revision),
  }
}
function privateReview(value: unknown, id: number): WorkshopPrivateReview {
  return review(value, id, true) as WorkshopPrivateReview
}
function pagination(page: number, limit: number) {
  return request(() => ({
    page: String(integer(page, 1, 2147483647)),
    limit: String(integer(limit, 1, 100)),
  }))
}
function pageParser<T>(page: number, limit: number, parse: (value: unknown) => T) {
  return (value: unknown): WorkshopCommunityPage<T> => {
    const p = exact(value, ['items', 'total', 'page', 'limit'])
    const total = integer(p.total)
    if (
      p.page !== page ||
      p.limit !== limit ||
      !Array.isArray(p.items) ||
      p.items.length > limit ||
      p.items.length > total
    )
      throw new Error('response')
    return { items: p.items.map(parse), total, page, limit }
  }
}
function input(value: WorkshopReviewInput) {
  return request(() => {
    const p = record(value)
    if (Object.keys(p).some((key) => !['recommended', 'text'].includes(key)))
      throw new Error('input')
    const recommended = boolean(p.recommended)
    return p.text === undefined ? { recommended } : { recommended, text: string(p.text, 1000) }
  })
}
export function apiWorkshopCommunitySummary(id: number) {
  return apiRequest(`${projectPath(id)}/community-summary`, (value): WorkshopCommunitySummary => {
    const p = exact(value, [
      'totalReviews',
      'positiveReviews',
      'negativeReviews',
      'positiveRate',
      'recommendation',
      'favoriteCount',
    ])
    const totalReviews = integer(p.totalReviews)
    const positiveReviews = integer(p.positiveReviews)
    const negativeReviews = integer(p.negativeReviews)
    const favoriteCount = integer(p.favoriteCount)
    if (totalReviews !== positiveReviews + negativeReviews) throw new Error('response')
    const positiveRate = totalReviews
      ? Math.floor((positiveReviews * 10000) / totalReviews) / 100
      : null
    const ratio = totalReviews ? positiveReviews / totalReviews : 0
    const recommendation = !totalReviews
      ? '暂无评价'
      : ratio >= 0.95
        ? totalReviews >= 100
          ? '好评如潮'
          : totalReviews >= 50
            ? '特别好评'
            : '好评'
        : ratio >= 0.8
          ? totalReviews >= 50
            ? '特别好评'
            : '好评'
          : ratio >= 0.7
            ? '多半好评'
            : ratio >= 0.4
              ? '褒贬不一'
              : ratio >= 0.2
                ? '多半差评'
                : totalReviews >= 100
                  ? '差评如潮'
                  : totalReviews >= 50
                    ? '特别差评'
                    : '差评'
    if (p.positiveRate !== positiveRate || p.recommendation !== recommendation)
      throw new Error('response')
    return {
      totalReviews,
      positiveReviews,
      negativeReviews,
      positiveRate,
      recommendation,
      favoriteCount,
    }
  })
}
export function apiWorkshopReviews(id: number, page = 1, limit = 20) {
  const params = pagination(page, limit)
  return apiRequest(
    `${projectPath(id)}/reviews`,
    pageParser(page, limit, (value) => {
      const result = review(value, id)
      if (!result.text.trim()) throw new Error('response')
      return result as WorkshopReview
    }),
    undefined,
    'GET',
    undefined,
    params,
  )
}
export function apiWorkshopMyReview(auth: ApiAuth, id: number) {
  return apiRequest(
    `${projectPath(id)}/my-review`,
    (value) => (value === null ? null : privateReview(value, id)),
    auth,
  )
}
export function apiWorkshopCreateReview(auth: ApiAuth, id: number, value: WorkshopReviewInput) {
  return apiRequest(
    `${projectPath(id)}/my-review`,
    (value) => privateReview(value, id),
    auth,
    'POST',
    input(value),
  )
}
export function apiWorkshopUpdateReview(
  auth: ApiAuth,
  id: number,
  value: WorkshopReviewInput & { expectedRevision: number },
) {
  const body = request(() => {
    const p = record(value)
    if (Object.keys(p).some((key) => !['recommended', 'text', 'expectedRevision'].includes(key)))
      throw new Error('input')
    return {
      ...input({
        recommended: value.recommended,
        ...(value.text === undefined ? {} : { text: value.text }),
      }),
      expectedRevision: integer(value.expectedRevision),
    }
  })
  return apiRequest(
    `${projectPath(id)}/my-review`,
    (value) => privateReview(value, id),
    auth,
    'PATCH',
    body,
  )
}
function favoriteParser(id: number, expected?: boolean) {
  return (value: unknown) => {
    const p = exact(value, ['scnid', 'favorited'])
    const favorited = boolean(p.favorited)
    if (p.scnid !== id || (expected !== undefined && favorited !== expected))
      throw new Error('response')
    return { scnid: id, favorited }
  }
}
export function apiWorkshopFavorite(auth: ApiAuth, id: number) {
  return apiRequest(`${projectPath(id)}/favorite`, favoriteParser(id), auth)
}
export function apiWorkshopSetFavorite(auth: ApiAuth, id: number, favorited: boolean) {
  request(() => boolean(favorited))
  return apiRequest(
    `${projectPath(id)}/favorite`,
    favoriteParser(id, favorited),
    auth,
    favorited ? 'PUT' : 'DELETE',
  )
}
export function apiWorkshopFavorites(auth: ApiAuth, page = 1, limit = 12) {
  const params = pagination(page, limit)
  return apiRequest(
    '/workshop/my-favorites',
    pageParser(page, limit, (value): WorkshopFavorite => {
      const p = exact(value, ['scnid', 'title', 'description', 'slug', 'createdAt'])
      return {
        scnid: scnid(p.scnid),
        title: string(p.title, 120),
        description: string(p.description, 1000),
        slug: p.slug === null ? null : string(p.slug, 80),
        createdAt: date(p.createdAt),
      }
    }),
    auth,
    'GET',
    undefined,
    params,
  )
}
export function apiWorkshopReviewModeration(auth: ApiAuth, id: number, page = 1, limit = 20) {
  const params = pagination(page, limit)
  return apiRequest(
    `${projectPath(id)}/review-moderation`,
    pageParser(page, limit, (value) => privateReview(value, id)),
    auth,
    'GET',
    undefined,
    params,
  )
}
export function apiWorkshopReviewVisibility(
  auth: ApiAuth,
  id: number,
  reviewId: string,
  expectedRevision: number,
  visible: boolean,
) {
  const target = request(() => uuid(reviewId))
  const body = request(() => ({
    expectedRevision: integer(expectedRevision),
    visible: boolean(visible),
  }))
  return apiRequest(
    `${projectPath(id)}/reviews/${target}/visibility`,
    (value) => {
      const result = privateReview(value, id)
      if (
        result.id !== target ||
        result.textVisible !== visible ||
        result.revision <= expectedRevision ||
        result.visibilitySource !== 'AUTHOR'
      )
        throw new Error('response')
      return result
    },
    auth,
    'PATCH',
    body,
  )
}
