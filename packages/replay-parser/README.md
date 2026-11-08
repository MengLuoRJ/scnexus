# @scnexus/replay-parser

Pure TypeScript replay decoding and analysis. The host supplies decoded archive components; this package does not access files or Electron.

## Spatial tracker timeline

```ts
import { buildReplaySpatialTimeline } from '@scnexus/replay-parser'

const timeline = buildReplaySpatialTimeline(tracker, durationGameLoops)
```

`tracker` is `ReplayTrackerEvents`; optional `durationGameLoops` must be a non-negative safe integer. The output duration is the maximum of this hint and accepted tracker loops (or just tracker loops without a hint). Invalid build/duration arguments throw `RangeError`.

Exported JSON-safe contracts: `ReplaySpatialTimeline`, `ReplaySpatialUnit`, `ReplaySpatialObservation`, `ReplaySpatialDiagnostic`. Timeline version is `1`. Units use `unitTag = "index:recycle"`, preserving index reuse. Observations are ordered, cumulative snapshots of known unit type, control/upkeep owner, completion and last known location. Equal-loop observations retain source order. Born units start complete, Init units become complete at Done. A death is terminal; when sampling, a unit is alive only for `startedGameLoop <= loop` and (`diedGameLoop === null` or `loop < diedGameLoop`). Units not yet born must not appear at earlier times.

Positions decode `m_firstUnitIndex` plus cumulative index deltas in `m_items` triples. Location observations include born/init/death coordinates; builds before 27950 multiply tracker coordinates by four. `positionGameLoop` records when location was actually observed, even when an owner/type/completion snapshot carries it forward. Location age is `sampleLoop - positionGameLoop`; null means unknown. Never interpolate or extrapolate positions: these are sparse observations, not exact trajectories, orders, visibility, terrain or a game simulation.

Unknown references, malformed fields/ordering, duplicate identities, post-death updates and unsupported unit events mark `partial` and add diagnostic codes with an optional event loop. Unrelated player/stat/upgrade events are ignored. Tracker warnings, skipped events and unknown event IDs also mark the timeline partial. No speculative unit is created for an unknown reference. Malformed fields retain previous known values; valid fields and lifecycle observations may still be retained.

Work/output ceilings are 100,000 input events, 50,000 units, 200,000 total observations and 200,000 examined position triples. Budget exhaustion produces partial output, not an exception; diagnostics are capped at 256. Type names are bounded to 256 characters. The bounded, plain-data result is suitable for an IPC DTO/cache, but hosts should still enforce their own cache byte and entry limits. Partial output must not be presented as complete coverage.
