import { apiRequest, type ApiAuth } from './internal/client'
export type CreatorState = {
  userId: string
  state: 'NONE' | 'ACTIVE' | 'REVOKED' | 'BLOCKED'
  source: null | 'ADMIN' | 'INVITATION' | 'LEGACY'
}
function creator(value: unknown): CreatorState {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid creator state')
  const data = value as Record<string, unknown>
  if (
    typeof data.userId !== 'string' ||
    !data.userId ||
    !['NONE', 'ACTIVE', 'REVOKED', 'BLOCKED'].includes(data.state as string) ||
    !(data.source === null || ['ADMIN', 'INVITATION', 'LEGACY'].includes(data.source as string))
  )
    throw new Error('Invalid creator state')
  return {
    userId: data.userId,
    state: data.state as CreatorState['state'],
    source: data.source as CreatorState['source'],
  }
}
export type CreatorQuota = {
  userId: string
  maxProjects: number
  maxPackageBytes: number
  maxStorageBytes: number
  usedStorageBytes: number
}
function quota(value: unknown): CreatorQuota {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid creator quota')
  const data = value as Record<string, unknown>
  if (
    typeof data.userId !== 'string' ||
    !data.userId ||
    !Number.isInteger(data.maxProjects) ||
    Number(data.maxProjects) < 1 ||
    Number(data.maxProjects) > 2147483647 ||
    !Number.isInteger(data.maxPackageBytes) ||
    Number(data.maxPackageBytes) < 0 ||
    Number(data.maxPackageBytes) > 2147483647 ||
    ![data.maxStorageBytes, data.usedStorageBytes].every(
      (bytes) => Number.isSafeInteger(bytes) && Number(bytes) >= 0,
    )
  )
    throw new Error('Invalid creator quota')
  return {
    userId: data.userId,
    maxProjects: data.maxProjects as number,
    maxPackageBytes: data.maxPackageBytes as number,
    maxStorageBytes: data.maxStorageBytes as number,
    usedStorageBytes: data.usedStorageBytes as number,
  }
}
export const apiCreatorQuota = (auth: ApiAuth) => apiRequest('/workshop/creator/quota', quota, auth)
export const apiCreatorState = (auth: ApiAuth) => apiRequest('/workshop/creator', creator, auth)
export const apiCreatorRedeem = (auth: ApiAuth, code: string) =>
  apiRequest('/workshop/creator/redeem', creator, auth, 'POST', { code })
