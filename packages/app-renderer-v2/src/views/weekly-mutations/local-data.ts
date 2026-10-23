import snapshot from '../../assets/mutators/weekly-data-default.json'
import type {
  MutationMap,
  MutationRegion,
  MutationLanguage,
  Mutator,
  MutatorCatalog,
  WeeklyMutation,
} from '../../apis/weekly-mutations'

type LocalSnapshot = {
  revision: number
  updatedAt: string
  catalog: {
    maps: MutationMap[]
    mutators: Mutator[]
    mutations: (MutationMap & { mapId: string; mutatorIds: string[] })[]
    schedules: {
      startIndex: number
      intervalDays: number
      rotation: string[]
      regions: {
        region: string
        start: string
        validFrom?: string
        validUntil?: string | null
        verifiedAt: string | null
      }[]
    }[]
    overrides: {
      region: string
      mutationId: string
      startsAt: string
      endsAt: string
      verifiedAt: string
    }[]
  }
}
const WEEK_MS = 7 * 86400000
export function localize<T extends MutationMap>(item: T, language: MutationLanguage): T {
  return { ...item, language, displayName: item.name[language] || item.name.enUS || item.name.zhCN }
}
export function localMutatorCatalog(language: MutationLanguage = 'zhCN'): MutatorCatalog {
  return {
    revision: snapshot.revision,
    language,
    items: snapshot.catalog.mutators.map((item) => localize(item, language)),
  }
}
export function localWeeklyMutation(
  now = Date.now(),
  data: LocalSnapshot = snapshot,
  region: MutationRegion = 'CN',
  language: MutationLanguage = 'zhCN',
): WeeklyMutation {
  const base = {
    region,
    language,
    revision: data.revision,
    updatedAt: data.updatedAt,
    asOf: new Date(now).toISOString(),
  }
  const overrides = data.catalog.overrides.filter((item) => item.region === region)
  const override = overrides.find(
    (item) => Date.parse(item.startsAt) <= now && now < Date.parse(item.endsAt),
  )
  let mutationId: string
  let startsAt: number
  let endsAt: number
  let lastVerifiedAt: string | null
  if (override) {
    mutationId = override.mutationId
    startsAt = Date.parse(override.startsAt)
    endsAt = Date.parse(override.endsAt)
    lastVerifiedAt = override.verifiedAt
  } else {
    const schedule = data.catalog.schedules.find((item) =>
      item.regions.some((entry) => entry.region === region),
    )
    const entry = schedule?.regions.find((item) => item.region === region)
    if (!schedule || !entry) return { ...base, available: false, reason: 'NO_SCHEDULE' }
    const validFrom = Date.parse(entry.validFrom ?? entry.start)
    const validUntil = entry.validUntil == null ? Infinity : Date.parse(entry.validUntil)
    if (now < validFrom || now >= validUntil)
      return { ...base, available: false, reason: 'OUTSIDE_VALIDITY' }
    const week = Math.floor((now - Date.parse(entry.start)) / WEEK_MS)
    const index =
      (((schedule.startIndex + week) % schedule.rotation.length) + schedule.rotation.length) %
      schedule.rotation.length
    mutationId = schedule.rotation[index]!
    startsAt = Math.max(Date.parse(entry.start) + week * WEEK_MS, validFrom)
    endsAt = Math.min(Date.parse(entry.start) + (week + 1) * WEEK_MS, validUntil)
    for (const item of overrides) {
      if (Date.parse(item.startsAt) > now) endsAt = Math.min(endsAt, Date.parse(item.startsAt))
      if (Date.parse(item.endsAt) <= now) startsAt = Math.max(startsAt, Date.parse(item.endsAt))
    }
    lastVerifiedAt = entry.verifiedAt
  }
  const mutation = data.catalog.mutations.find((item) => item.id === mutationId)
  const map = data.catalog.maps.find((item) => item.id === mutation?.mapId)
  const mutators = mutation?.mutatorIds.map((id) =>
    data.catalog.mutators.find((item) => item.id === id),
  )
  if (!mutation || !map || !mutators || mutators.some((item) => !item))
    throw new Error('Invalid local mutation references')
  return {
    ...base,
    available: true,
    dataStatus: override ? 'verified' : 'projected',
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    lastVerifiedAt,
    mutation: {
      ...localize(mutation, language),
      map: localize(map, language),
      mutators: (mutators as Mutator[]).map((item) => localize(item, language)),
    },
  }
}
