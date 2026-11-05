import { parse } from 'semver'
import { apiRequest, AccountError, type ApiAuth } from './internal/client'
import { validateDocument, type WorkshopDocument } from '../components/workshop/document'
export const socialKeys = [
  'twitter',
  'discord',
  'youtube',
  'weibo',
  'bilibili',
  'qq_group',
] as const
export const sponsorKeys = ['paypal', 'patreon', 'buymeacoffee', 'afdian'] as const
export type DownloadLink = { url: string; description: string }
export function isDownloadUrl(value: string): boolean {
  // oxlint-disable-next-line no-control-regex -- Match the server's rejection of raw control characters.
  if (!value || value.length > 2048 || /[\s\u0000-\u001f\u007f-\u009f\\]/u.test(value)) return false
  try {
    const url = new URL(value)
    return (
      /^https:\/\/[^/?#@]+(?:[/?#]|$)/i.test(value) &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}
export function parseDownloadLinks(value: unknown): DownloadLink[] {
  if (!Array.isArray(value) || value.length > 3) throw new Error('downloadLinks')
  return value.map((item) => {
    const link = record(item)
    if (Object.keys(link).some((key) => !['url', 'description'].includes(key)))
      throw new Error('downloadLinks')
    const url = text(link.url)
    if (!isDownloadUrl(url)) throw new Error('downloadLinks')
    return { url, description: text(link.description, 500) }
  })
}
export type ProjectInput = {
  title: string
  description: string
  website: string
  social: Record<string, string>
  sponsor: Record<string, string>
  detail: WorkshopDocument
  fileIds: string[]
  downloadLinks: DownloadLink[]
}
export type WorkshopProject = ProjectInput & {
  scnid: number
  slug: string | null
  approvedVersionId: string | null
}
export type OwnerProject = WorkshopProject & {
  contentRevision: number
  status: string
  candidateVersionId: string | null
}
export type WorkshopVersion = {
  id: string
  projectScnid: number
  version: string
  status: string
  revision: number
  manifest: Record<string, unknown>
  changelog: WorkshopDocument
  scanStatus: string
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('response')
  return value as Record<string, unknown>
}
export function text(value: unknown, max = 2048): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('response')
  return value
}
export function uuid(value: unknown): string {
  const id = text(value, 36)
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) throw new Error('response')
  return id
}
export function scnid(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 2147483647)
    throw new Error('response')
  return Number(value)
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('response')
  return Number(value)
}
function nullableId(value: unknown) {
  return value === null ? null : uuid(value)
}
function links(value: unknown, keys: readonly string[]) {
  const result = record(value)
  if (Object.keys(result).some((k) => !keys.includes(k))) throw new Error('response')
  return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, text(v)]))
}
export function parseProject(value: unknown): WorkshopProject {
  const p = record(value)
  const fileIds = p.fileIds === undefined ? [] : p.fileIds
  if (!Array.isArray(fileIds) || fileIds.length > 50) throw new Error('response')
  return {
    scnid: scnid(p.scnid),
    slug: p.slug === null ? null : text(p.slug, 80),
    approvedVersionId: nullableId(p.approvedVersionId),
    title: text(p.title, 120),
    description: text(p.description, 1000),
    website: text(p.website),
    social: links(p.social, socialKeys),
    sponsor: links(p.sponsor, sponsorKeys),
    detail: validateDocument(p.detail),
    fileIds: fileIds.map(uuid),
    downloadLinks: parseDownloadLinks(p.downloadLinks === undefined ? [] : p.downloadLinks),
  }
}
export function parseOwner(value: unknown): OwnerProject {
  const p = record(value)
  return {
    ...parseProject(p),
    contentRevision: revision(p.contentRevision),
    status: text(p.status, 30),
    candidateVersionId: nullableId(p.candidateVersionId),
  }
}
function array<T>(value: unknown, parse: (value: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('response')
  return value.map(parse)
}
export function parseVersion(value: unknown): WorkshopVersion {
  const p = record(value)
  return {
    id: uuid(p.id),
    projectScnid: scnid(p.projectScnid),
    version: text(p.version, 256),
    status: text(p.status, 40),
    revision: revision(p.revision),
    manifest: record(p.manifest),
    changelog: validateDocument(p.changelog),
    scanStatus: text(p.scanStatus, 40),
  }
}
export function isStrictSemver(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const version = parse(value)
  return Boolean(
    version &&
    `${version.version}${version.build.length ? '+' + version.build.join('.') : ''}` === value,
  )
}
export function apiWorkshopList(page = 1, query = '', limit = 12) {
  if (!Number.isSafeInteger(page) || page < 1 || query.length > 120 || limit < 1 || limit > 100)
    throw new AccountError('badRequest')
  return apiRequest(
    '/workshop/projects',
    (value) => {
      const p = record(value)
      if (p.page !== page || p.limit !== limit) throw new Error('response')
      return { items: array(p.items, parseProject), page, limit }
    },
    undefined,
    'GET',
    undefined,
    { page: String(page), limit: String(limit), query },
  )
}
export const apiWorkshopDetail = (id: number) =>
  apiRequest(`/workshop/projects/${scnid(id)}`, parseProject)
export const apiWorkshopMine = (auth: ApiAuth) =>
  apiRequest('/workshop/my-projects', (value) => array(value, parseOwner), auth)
// Create/PATCH responses deliberately omit owner-only fields; re-read the owner list after success.
function mutation(value: unknown) {
  const p = record(value)
  return { scnid: scnid(p.scnid), contentRevision: revision(p.contentRevision) }
}
export const apiWorkshopCreate = (auth: ApiAuth, input: ProjectInput) =>
  apiRequest('/workshop/projects', mutation, auth, 'POST', input)
export const apiWorkshopUpdate = (
  auth: ApiAuth,
  id: number,
  expectedRevision: number,
  input: ProjectInput,
) =>
  apiRequest(`/workshop/projects/${scnid(id)}`, mutation, auth, 'PATCH', {
    ...input,
    expectedRevision,
  })
export const apiWorkshopVersions = (auth: ApiAuth, id: number) =>
  apiRequest(
    `/workshop/projects/${scnid(id)}/versions`,
    (value) => array(value, parseVersion),
    auth,
  )
export function apiWorkshopCreateVersion(
  auth: ApiAuth,
  id: number,
  manifest: Record<string, unknown>,
  changelog: WorkshopDocument,
) {
  if (!isStrictSemver(manifest.version)) throw new AccountError('badRequest')
  return apiRequest(`/workshop/projects/${scnid(id)}/versions`, parseVersion, auth, 'POST', {
    manifest,
    changelog,
  })
}
export const apiWorkshopCancelCandidate = (auth: ApiAuth, id: string) =>
  apiRequest(`/workshop/versions/${uuid(id)}/candidate`, () => undefined, auth, 'DELETE')
