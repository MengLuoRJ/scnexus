import snapshot from '../../assets/mutators/weekly-data-default.json'
import type {
  MutationMap,
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
      region: string
      anchorAt: string
      anchorIndex: number
      rotation: string[]
      validFrom: string
      validUntil: string | null
      verifiedAt: string | null
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
export function localMutatorCatalog(): MutatorCatalog {
  return { revision: snapshot.revision, items: snapshot.catalog.mutators }
}
export function localWeeklyMutation(
  now = Date.now(),
  data: LocalSnapshot = snapshot,
): WeeklyMutation {
  const base = {
    region: 'CN' as const,
    revision: data.revision,
    updatedAt: data.updatedAt,
    asOf: new Date(now).toISOString(),
  }
  const overrides = data.catalog.overrides.filter((item) => item.region === 'CN')
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
    const schedule = data.catalog.schedules.find((item) => item.region === 'CN')
    if (!schedule) return { ...base, available: false, reason: 'NO_SCHEDULE' }
    if (
      now < Date.parse(schedule.validFrom) ||
      (schedule.validUntil !== null && now >= Date.parse(schedule.validUntil))
    )
      return { ...base, available: false, reason: 'OUTSIDE_VALIDITY' }
    const week = Math.floor((now - Date.parse(schedule.anchorAt)) / WEEK_MS)
    const index =
      (((schedule.anchorIndex + week) % schedule.rotation.length) + schedule.rotation.length) %
      schedule.rotation.length
    mutationId = schedule.rotation[index]!
    startsAt = Math.max(
      Date.parse(schedule.anchorAt) + week * WEEK_MS,
      Date.parse(schedule.validFrom),
    )
    endsAt = Math.min(
      Date.parse(schedule.anchorAt) + (week + 1) * WEEK_MS,
      schedule.validUntil === null ? Infinity : Date.parse(schedule.validUntil),
    )
    for (const item of overrides) {
      if (Date.parse(item.startsAt) > now) endsAt = Math.min(endsAt, Date.parse(item.startsAt))
      if (Date.parse(item.endsAt) <= now) startsAt = Math.max(startsAt, Date.parse(item.endsAt))
    }
    lastVerifiedAt = schedule.verifiedAt
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
    mutation: { ...mutation, map, mutators: mutators as Mutator[] },
  }
}
