import { expect, test } from 'vitest'
import snapshot from '../../../assets/mutators/weekly-data-default.json'
import { localWeeklyMutation, localMutatorCatalog } from '../local-data'

test('bundled snapshot resolves every referenced map and factor throughout the rotation', () => {
  const schedule = snapshot.catalog.schedules[0]!
  for (let i = 0; i < schedule.rotation.length; i++) {
    const result = localWeeklyMutation(
      Date.parse(schedule.regions.find((item) => item.region === 'CN')!.start) + i * 7 * 86400000,
    )
    expect(result.available).toBe(true)
    if (!result.available) throw new Error('Missing bundled schedule')
    expect(result.mutation.id).toBe(
      schedule.rotation[(schedule.startIndex + i) % schedule.rotation.length],
    )
    expect(result.mutation.mutators.length).toBeGreaterThan(0)
    expect(result.mutation.map.id).toBeTruthy()
  }
  expect(localMutatorCatalog().items.map((item) => item.id)).toEqual(
    snapshot.catalog.mutators.map((item) => item.id),
  )
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

test('shared schedule honors each region start, boundaries and full-cycle wrap', () => {
  const schedule = snapshot.catalog.schedules[0]!
  for (const region of ['CN', 'NA', 'EU', 'AS'] as const) {
    const row = schedule.regions.find((item) => item.region === region)!
    const start = Date.parse(row.start)
    expect(localWeeklyMutation(start - 1, snapshot, region)).toMatchObject({
      available: false,
      reason: 'OUTSIDE_VALIDITY',
    })
    for (const index of [0, 1, schedule.rotation.length]) {
      expect(
        localWeeklyMutation(start + index * 7 * 86400000, snapshot, region, 'frFR'),
      ).toMatchObject({
        region,
        language: 'frFR',
        available: true,
        mutation: {
          id: schedule.rotation[(schedule.startIndex + index) % schedule.rotation.length],
        },
      })
    }
  }
  const cnStart = Date.parse(schedule.regions.find((item) => item.region === 'CN')!.start)
  expect(localWeeklyMutation(cnStart, snapshot, 'NA').available).toBe(false)
})
test('local language selection follows requested language then English then Chinese', () => {
  const catalog = localMutatorCatalog('ruRU')
  for (const item of catalog.items)
    expect(item.displayName).toBe(item.name.ruRU || item.name.enUS || item.name.zhCN)
})

test('regional overrides never leak to other servers and canonical validity bounds are preserved', () => {
  const start = Date.parse('2026-10-23T00:00:00Z')
  const data = {
    ...snapshot,
    catalog: {
      ...snapshot.catalog,
      overrides: [
        {
          region: 'CN',
          mutationId: snapshot.catalog.mutations[0]!.id,
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(start + 86400000).toISOString(),
          verifiedAt: new Date(start).toISOString(),
        },
      ],
    },
  }
  expect(localWeeklyMutation(start, data, 'CN')).toMatchObject({ dataStatus: 'verified' })
  expect(localWeeklyMutation(start, data, 'NA')).toMatchObject({ dataStatus: 'projected' })
  const bounded = {
    ...snapshot,
    catalog: {
      ...snapshot.catalog,
      schedules: snapshot.catalog.schedules.map((item) => ({
        ...item,
        regions: item.regions.map((row) => ({
          ...row,
          validFrom: new Date(start).toISOString(),
          validUntil: new Date(start + 1000).toISOString(),
        })),
      })),
    },
  }
  expect(localWeeklyMutation(start - 1, bounded)).toMatchObject({ available: false })
  expect(localWeeklyMutation(start, bounded)).toMatchObject({
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 1000).toISOString(),
  })
  expect(localWeeklyMutation(start + 1000, bounded)).toMatchObject({ available: false })
})
