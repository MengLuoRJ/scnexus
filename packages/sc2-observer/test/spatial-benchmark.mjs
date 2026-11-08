import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { createReplayObserver, sampleReplaySpatialTimeline } from '../dist/index.js'
import { spatialFixture } from './spatial-fixture.ts'

const samples = 512
const warmup = 128
const rounds = 3
function measure(sample, loops) {
  for (let index = 0; index < warmup; index++) sample(loops[index % loops.length])
  global.gc()
  const durations = loops
    .map((loop) => {
      const started = performance.now()
      sample(loop)
      return performance.now() - started
    })
    .sort((a, b) => a - b)
  return {
    p50: durations[Math.floor(durations.length * 0.5)],
    p95: durations[Math.floor(durations.length * 0.95)],
  }
}

console.log(
  JSON.stringify({
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    samples,
    warmup,
    rounds,
  }),
)
for (const staggered of [true, false]) {
  const timeline = spatialFixture(4000, 32, staggered)
  const started = performance.now()
  const observer = createReplayObserver(timeline)
  console.log(
    JSON.stringify({
      workload: staggered ? 'staggered' : 'dense',
      units: 4000,
      observationsPerUnit: 32,
      constructionMs: +(performance.now() - started).toFixed(2),
    }),
  )
  const forward = Array.from({ length: samples }, (_, index) => index)
  let seed = 1
  const random = Array.from({ length: samples }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % timeline.durationGameLoops
  })
  for (const [name, loops] of [
    ['opening', forward],
    ['random', random],
  ]) {
    const results = { stateless: [], observer: [] }
    const samplers = {
      stateless: (loop) => sampleReplaySpatialTimeline(timeline, loop),
      observer: (loop) => observer.seek(loop),
    }
    for (let round = 0; round < rounds; round++) {
      for (const key of round % 2 ? ['observer', 'stateless'] : ['stateless', 'observer'])
        results[key].push(measure(samplers[key], loops))
    }
    const median = (values) =>
      values.sort((a, b) => a - b)[Math.floor(values.length / 2)].toFixed(4)
    const summarize = (values) => ({
      p50: median(values.map((value) => value.p50)),
      p95: median(values.map((value) => value.p95)),
    })
    console.log(
      JSON.stringify({
        workload: name,
        stateless: summarize(results.stateless),
        observer: summarize(results.observer),
        unit: 'median across rounds, ms/sample',
      }),
    )
  }
  observer.dispose()
}
