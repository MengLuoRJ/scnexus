import { apiRequest, type ApiAuth } from './internal/client'
import { record, text, uuid, scnid } from './workshop'
export type FileRead = { fileId: string; url: string; expiresAt: string }
export function parseFileReads(value: unknown): FileRead[] {
  const p = record(value)
  if (!Array.isArray(p.items) || p.items.length > 50) throw new Error('response')
  return p.items.map((value) => {
    const item = record(value)
    const url = new URL(text(item.url, 8192))
    const expiresAt = text(item.expiresAt, 80)
    const origin = import.meta.env.VITE_SCNEXUS_FILES_ORIGIN
    if (!origin || new URL(origin).origin !== origin || url.origin !== origin)
      throw new Error('Untrusted file origin')
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !Number.isFinite(Date.parse(expiresAt))
    )
      throw new Error('response')
    return { fileId: uuid(item.fileId), url: url.href, expiresAt }
  })
}
function ids(fileIds: string[]) {
  if (!fileIds.length || fileIds.length > 50) throw new Error('fileIds')
  return fileIds.map(uuid)
}
export const apiFileRead = (auth: ApiAuth, fileIds: string[]) =>
  apiRequest('/files/read-authorizations', parseFileReads, auth, 'POST', { fileIds: ids(fileIds) })
export const apiWorkshopFileRead = (id: number, fileIds: string[]) =>
  apiRequest(
    `/workshop/projects/${scnid(id)}/file-read-authorizations`,
    parseFileReads,
    undefined,
    'POST',
    { fileIds: ids(fileIds) },
  )
