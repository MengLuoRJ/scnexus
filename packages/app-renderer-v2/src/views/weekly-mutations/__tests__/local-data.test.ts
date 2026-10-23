import { expect, test } from 'vitest'
import snapshot from '../../../assets/mutators/weekly-data-default.json'
import { localWeeklyMutation, localMutatorCatalog } from '../local-data'

test('bundled snapshot resolves every referenced map and factor throughout the rotation', () => {
  const schedule = snapshot.catalog.schedules[0]!
  for (let i = 0; i < schedule.rotation.length; i++) {
    const result = localWeeklyMutation(Date.parse(schedule.anchorAt) + i * 7 * 86400000)
    expect(result.available).toBe(true)
    if (!result.available) throw new Error('Missing bundled schedule')
    expect(result.mutation.id).toBe(
      schedule.rotation[(schedule.anchorIndex + i) % schedule.rotation.length],
    )
    expect(result.mutation.mutators.length).toBeGreaterThan(0)
    expect(result.mutation.map.id).toBeTruthy()
  }
  expect(localMutatorCatalog().items).toEqual(snapshot.catalog.mutators)
})
test('end boundary advances to the next week and outside validity remains unavailable', () => {
  const now = Date.parse('2026-10-23T00:00:00Z')
  const current = localWeeklyMutation(now)
  if (!current.available) throw new Error('Expected local schedule')
  const next = localWeeklyMutation(Date.parse(current.endsAt))
  expect(next.available).toBe(true)
  if (!next.available) throw new Error('Expected following week')
  expect(next.startsAt).toBe(current.endsAt)
  expect(localWeeklyMutation(Date.parse('2020-01-01T00:00:00Z'))).toMatchObject({
    available: false,
    reason: 'OUTSIDE_VALIDITY',
  })
  expect(
    localWeeklyMutation(now, { ...snapshot, catalog: { ...snapshot.catalog, schedules: [] } }),
  ).toMatchObject({ available: false, reason: 'NO_SCHEDULE' })
})
test('overrides take precedence and clip projected intervals before and after them', () => {
  const start = Date.parse('2026-10-23T00:00:00Z')
  const end = start + 86400000
  const data = {
    ...snapshot,
    catalog: {
      ...snapshot.catalog,
      overrides: [
        {
          region: 'CN',
          mutationId: snapshot.catalog.mutations[0]!.id,
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(end).toISOString(),
          verifiedAt: new Date(start).toISOString(),
        },
      ],
    },
  }
  expect(localWeeklyMutation(start - 1, data)).toMatchObject({
    endsAt: new Date(start).toISOString(),
    dataStatus: 'projected',
  })
  expect(localWeeklyMutation(start, data)).toMatchObject({
    dataStatus: 'verified',
    mutation: { id: snapshot.catalog.mutations[0]!.id },
  })
  expect(localWeeklyMutation(end, data)).toMatchObject({
    startsAt: new Date(end).toISOString(),
    dataStatus: 'projected',
  })
})
