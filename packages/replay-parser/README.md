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

## Recorded command targets

```ts
import { buildReplayCommandTimeline } from '@scnexus/replay-parser'

const commands = buildReplayCommandTimeline(gameEvents, timeline)
```

The pure TS API returns `ReplayCommandObservation[]` and preserves the game-event `userId` namespace. `target` distinguishes explicit `none`, `point`, `unit`, opaque `data`, and `unknown`; legacy flat target fields without a validated discriminator stay unknown. Legacy flat ability fields are retained. `rawPoint` contains protocol integers without coordinate conversion; it is not a tracker position or movement route.

A unit target preserves its unsigned 32-bit `rawTag`. For verified game protocols with the same base build, its index/recycle pair may link to a spatial unit strictly inside the recorded lifetime. The linked type and `observedGameLoop` come from the latest tracker observation strictly before the command. Equal-loop birth, death or type changes do not establish cross-stream ordering. Missing, ambiguous or recycled identities do not borrow another unit's record; duplicate, malformed or budget-limited spatial evidence disables association. An incomplete tracker may still provide direct, earlier evidence.

Commands are issued intent. Target units are not issuing units, linked names are earlier records, and neither target points nor unit snapshot points update observed positions. Command execution outcomes and ability names are outside this projection. Unverified protocols retain target data without tracker association. Existing event/unit ceilings apply; exceeding them throws `RangeError`. The desktop analysis cache uses `commands-v3` so old command projections require reanalysis.

## Recorded selections and control groups

`buildReplaySelectionTimeline(gameEvents)` projects one `ReplaySelectionObservation` per command, preserving the input `eventIndex`, loop and raw user ID. Supply a complete, ordered decoded game stream, not a sliced event window. Groups start empty; equal-loop events use their encoded order. `buildReplayCommandTimeline` includes the same evidence in `selection`. This field is optional when reading previously persisted analysis.

For verified protocols, selection deltas support no removal, bit masks, remove indices (`OneIndices`) and keep indices (`ZeroIndices`). Unit tags are deduplicated and sorted numerically as unsigned 32-bit identities. Stored groups 0–9 and active selection 10 are isolated per user. Set (0), add (1), and recall (2) preserve independent snapshots; recall masks do not alter the stored group. Subgroup metadata does not identify the executing unit. Bit arrays now retain `bitOffset` alongside the existing `bitLength` and decimal `value`, preserving wire order across byte boundaries. Decoder algorithm version is `2.0.1`; old bit arrays without alignment remain unknown rather than guessing their membership.

Unverified protocols, malformed evidence and unsupported updates (including steal variants) produce `unitTags: null` with a reason, never an empty selection. An explicit full replacement can recover the affected group; appending to an unknown group cannot. Invalid group identifiers and unsupported updates invalidate that user's groups conservatively. Selection is previous recorded membership, not proof of execution, visibility, ownership or continued life. No client state is read.

Limits are 100,000 input events, 32 users, 11 groups per user, 512 tags per group and 250,000 retained snapshot tags. Invalid event ordering or the event ceiling throws `RangeError`; once the snapshot budget is exhausted, later commands keep their other data and report `budget-exceeded` selection evidence instead of failing analysis.
