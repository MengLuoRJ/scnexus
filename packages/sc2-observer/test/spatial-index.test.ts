import { expect, test } from 'vitest'
import { createReplayObserver, sampleReplaySpatialTimeline } from '../src/index.js'
import { createIndexedSpatialSampler } from '../src/spatial-sampler.js'
import { spatialFixture } from './spatial-fixture.js'

test.each([true, false])('indexed seeks match stateless sampling, staggered=%s', (staggered) => {
  const fixture = spatialFixture(80, 24, staggered)
  const timeline = {
    ...fixture,
    units: [...fixture.units].reverse().map((unit, index) => ({
      ...unit,
      diedGameLoop: index % 3 === 0 ? unit.startedGameLoop + 128 : null,
      observations: unit.observations.flatMap((observation, sample) => {
        const current =
          index % 4 === 0
            ? { ...observation, x: null, y: null, positionGameLoop: null }
            : observation
        return sample === 2 ? [current, { ...current, unitType: 'EqualLoopLast' }] : [current]
      }),
    })),
  }
  const observer = createReplayObserver(timeline)
  let seed = 42
  const loops = [0, 0.5, 32, 64, 128, 128.5, 129, 127, -1, timeline.durationGameLoops + 1]
  for (let index = 0; index < 200; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    loops.push(seed % timeline.durationGameLoops)
  }
  for (const loop of loops) {
    expect(observer.seek(loop).units).toEqual(sampleReplaySpatialTimeline(timeline, loop))
  }
  observer.dispose()
})

test('cached observation intervals skip repeated searches without reusing published state', () => {
  let reads = 0
  const fixture = spatialFixture(4, 256, false)
  const timeline = {
    ...fixture,
    units: fixture.units.map((unit) => ({
      ...unit,
      observations: unit.observations.map((observation) => ({
        ...observation,
        get gameLoop() {
          reads++
          return observation.gameLoop
        },
      })),
    })),
  }
  const sampler = createIndexedSpatialSampler(timeline)
  const previous = sampler.sample(10000)
  reads = 0
  const next = sampler.sample(10001)
  expect(reads).toBeLessThanOrEqual(8)
  expect(next[0]?.position?.ageGameLoops).toBe(previous[0]!.position!.ageGameLoops + 1)
  expect(previous[0]?.position?.ageGameLoops).toBe(16)
  expect(Object.isFrozen(next[0]?.position)).toBe(true)
  expect(next[0]).not.toBe(previous[0])
  sampler.dispose()
})

test('birth intervals skip future units until a boundary is crossed', () => {
  let reads = 0
  const fixture = spatialFixture(100, 4)
  const sampler = createIndexedSpatialSampler({
    ...fixture,
    units: fixture.units.map((unit) => ({
      ...unit,
      get startedGameLoop() {
        reads++
        return unit.startedGameLoop
      },
    })),
  })
  expect(sampler.sample(32)).toHaveLength(2)
  reads = 0
  expect(sampler.sample(63)).toHaveLength(2)
  expect(reads).toBe(0)
  expect(sampler.sample(64)).toHaveLength(3)
  expect(sampler.sample(31)).toHaveLength(1)
  expect(sampler.sample(64)).toHaveLength(3)
  sampler.dispose()
})

test('late first observations and empty histories survive repeated rewinds and disposal', () => {
  const fixture = spatialFixture(3, 4, false)
  const timeline = {
    ...fixture,
    units: fixture.units.map((unit, index) => ({
      ...unit,
      observations: unit.observations.slice(index === 0 ? 4 : 1),
    })),
  }
  const observer = createReplayObserver(timeline)
  observer.selectUnit('1:1')
  const selected = observer.seek(64)
  expect(selected.selectedUnit?.position?.observedGameLoop).toBe(64)
  expect(observer.seek(63).selectedUnit).toBeNull()
  expect(observer.seek(128).units.map((unit) => unit.unitTag)).toEqual(['1:1', '2:1'])
  expect(observer.seek(0).units).toEqual([])
  expect(observer.seek(64).selectedUnit).toEqual(selected.selectedUnit)
  observer.dispose()
  expect(observer.getState().selectedUnit).toEqual(selected.selectedUnit)
  observer.dispose()
})
