import { apiRequest } from './internal/client'

export type MutationName = { zhCN: string; enUS?: string }
export type MutationMap = { id: string; name: MutationName; description?: string }
export type Mutator = MutationMap & { description: string; communityScore?: number }
export type WeeklyMutation = {
  region: 'CN'
  revision: number
  updatedAt: string
  asOf: string
} & (
  | { available: false; reason: 'NO_SCHEDULE' | 'OUTSIDE_VALIDITY' }
  | {
      available: true
      dataStatus: 'projected' | 'verified'
      startsAt: string
      endsAt: string
      lastVerifiedAt: string | null
      mutation: MutationMap & { map: MutationMap; mutators: Mutator[] }
    }
)
export type MutatorCatalog = { revision: number; items: Mutator[] }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid response')
  return value as Record<string, unknown>
}
function text(value: unknown, max = 4000): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid text')
  return value
}
function timestamp(value: unknown): string {
  const result = text(value, 80)
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result)))
    throw new Error('Invalid timestamp')
  return result
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid revision')
  return value
}
function entry(value: unknown): MutationMap {
  const item = object(value)
  const id = text(item.id, 80)
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)) throw new Error('Invalid ID')
  const names = object(item.name)
  const zhCN = text(names.zhCN, 120)
  if (!zhCN.trim()) throw new Error('Invalid name')
  const enUS = names.enUS === undefined ? undefined : text(names.enUS, 120)
  return {
    id,
    name: { zhCN, ...(enUS ? { enUS } : {}) },
    ...(item.description === undefined ? {} : { description: text(item.description) }),
  }
}
function mutator(value: unknown): Mutator {
  const item = object(value)
  const score = item.communityScore
  if (
    score !== undefined &&
    (typeof score !== 'number' || !Number.isInteger(score) || score < -1 || score > 100)
  )
    throw new Error('Invalid score')
  return {
    ...entry(value),
    description: text(item.description),
    ...(score === undefined ? {} : { communityScore: score as number }),
  }
}
function items(value: unknown, max: number): Mutator[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('Invalid list')
  const result = value.map(mutator)
  if (new Set(result.map((item) => item.id)).size !== result.length) throw new Error('Duplicate ID')
  return result
}
function weekly(value: unknown): WeeklyMutation {
  const data = object(value)
  if (data.region !== 'CN') throw new Error('Invalid region')
  const base = {
    region: 'CN' as const,
    revision: revision(data.revision),
    updatedAt: timestamp(data.updatedAt),
    asOf: timestamp(data.asOf),
  }
  if (data.available === false) {
    if (data.reason !== 'NO_SCHEDULE' && data.reason !== 'OUTSIDE_VALIDITY')
      throw new Error('Invalid reason')
    return { ...base, available: false, reason: data.reason }
  }
  if (
    data.available !== true ||
    (data.dataStatus !== 'projected' && data.dataStatus !== 'verified')
  )
    throw new Error('Invalid availability')
  const startsAt = timestamp(data.startsAt)
  const endsAt = timestamp(data.endsAt)
  if (
    !(Date.parse(startsAt) <= Date.parse(base.asOf) && Date.parse(base.asOf) < Date.parse(endsAt))
  )
    throw new Error('Invalid period')
  const mutation = object(data.mutation)
  const factors = items(mutation.mutators, 20)
  if (!factors.length) throw new Error('Empty mutators')
  return {
    ...base,
    available: true,
    dataStatus: data.dataStatus,
    startsAt,
    endsAt,
    lastVerifiedAt: data.lastVerifiedAt === null ? null : timestamp(data.lastVerifiedAt),
    mutation: { ...entry(mutation), map: entry(mutation.map), mutators: factors },
  }
}
export const apiWeeklyMutation = () => apiRequest('/sc2/coop/weekly-mutations/current', weekly)
export const apiMutatorCatalog = () =>
  apiRequest('/sc2/coop/mutators', (value): MutatorCatalog => {
    const data = object(value)
    return { revision: revision(data.revision), items: items(data.items, 200) }
  })
