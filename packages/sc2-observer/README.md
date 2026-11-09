# @scnexus/sc2-observer

MIT-licensed, pure TypeScript headless playback manager for the observed spatial
history returned by `@scnexus/replay-parser`'s `buildReplaySpatialTimeline`.
No filesystem, Electron, UI framework, timers, or runtime dependencies.
The async API uses standard `AbortController` / `AbortSignal`, available in
browsers and the supported Node/Electron runtimes; it does not access the DOM.

```ts
import { createReplayObserver } from '@scnexus/sc2-observer'

const observer = createReplayObserver(timeline)
const unsubscribe = observer.subscribe((state) => {
  // A textual client can list state.units and their last observed positions.
  // Skip !unit.alive when showing only living units.
  render(state)
})
observer.selectUnit(timeline.units[0]?.unitTag ?? null)
observer.play()
observer.advance(16) // External driver supplies elapsed game loops, not seconds.
observer.seek(200)
unsubscribe()
observer.dispose()
```

## API and semantics

- `getState()` returns the immutable current snapshot.
- `seek(gameLoop)` clamps finite values to `[0, duration]`, including negative
  values; backward seeks reconstruct historical state, without future knowledge.
- `advance(deltaLoops)` accepts finite nonnegative fractional game loops. It only
  moves while playing and multiplies elapsed loops by the current speed.
  The external clock owns wall-clock conversion (for example 16 game loops per
  game-time second); the manager does not start clocks or infer replay speed.
- `play()` / `pause()` control advancement. Reaching the endpoint stops playback;
  `play()` at the endpoint does not rewind. Seek backward to replay.
- `setSpeed(speed)` requires a finite positive multiplier (default 1).
- `selectUnit(unitTag | null)` selects a known tag or clears selection; an unknown
  tag throws. Selection remains across seeks, including before the unit appears.
- `subscribe(listener)` returns an idempotent unsubscribe function. Listeners are
  called synchronously after changes, not on subscription. Exceptions propagate
  to the caller after state is committed. Paused or zero-delta advance is a no-op.
- `dispose()` releases subscriptions, is idempotent, and makes mutating methods
  and subscriptions throw. The final `getState()` snapshot remains readable.

State fields: `currentGameLoop`, `duration` (game loops), `playing`, `speed`,
`selectedUnitTag`, `selectedUnit`, and `units`. Units include `unitTag`, `alive`,
`completed`, `unitType`, `controlPlayerId`, `upkeepPlayerId`, and `position`.
`completed: false` means the unit is under construction. Units appear only at
or after their first observation and stay queryable after death (`alive: false`
at the death loop). An unobserved selected unit is `null`.

Positions are **last observed**, never interpolated or claimed to be exact at
unobserved loops. `position` is null when unknown, otherwise
`{ x, y, observedGameLoop, ageGameLoops }`. No map dimensions, terrain, visibility,
orders, or unsampled movement are invented. Partial parser timelines remain
partial: inspect their diagnostics in the caller before presenting results.

`ReplayObserverTimeline` is a structural subset of the parser contract, so parser
results can be passed directly without a runtime dependency. Construction copies
and validates timeline ordering, tags, loops, and positions. Equal-loop
observations preserve parser order (last wins). Treat standalone sampler inputs
as valid parser timelines; the manager performs validation once at construction.
`sampleReplaySpatialTimeline(timeline, gameLoop)` exposes the same pure sampling
without playback or selection. It clamps loops and returns immutable unit states.

## Asynchronous window sources

`createAsyncReplayObserver(source)` adds cancellation and buffering around the
same validated spatial sampler. The textual client now uses this API through an
in-memory timeline source; the synchronous API remains available to other users.
No file, IPC, network or SC2 capture adapter is provided by this package.

```ts
import { createAsyncReplayObserver } from '@scnexus/sc2-observer'
import type { ReplayObserverDataSource } from '@scnexus/sc2-observer'

async function openObserver(source: ReplayObserverDataSource) {
  const observer = createAsyncReplayObserver(source)
  const initial = await observer.seek(0)
  if (initial.status === 'ready') observer.play()
  // Supply elapsed game loops from the host clock, and await each advancement.
  await observer.advance(16)
  // The caller owns subscriptions and eventually calls observer.dispose().
  return observer
}
```

The injected source has a fixed `durationGameLoops` and
`loadWindow(gameLoop, signal): Promise<ReplayObserverWindow>`. Construction does
not load data. Initialize with `seek()`, and create a new session for another
replay. A window contains `{ fromGameLoop, toGameLoop, timeline }`:

- Bounds are inclusive, finite, nonnegative, inside the replay duration and must
  contain the requested loop. The timeline's duration is the **whole replay**
  duration, rather than window length.
- The source supplies cumulative state at the window start, followed by ordered
  observations through its end. Already-started units require an observation at
  or before the window start. A keyframe may use the window-start loop while
  retaining an older `positionGameLoop`; this preserves last-observed age.
  First observations of units born within the window may occur later.
- Preserve original tags, birth/death loops and retained dead units when building
  the cumulative frame. Do not convert window boundaries into birth events.
  Window units cannot start after the window end, and observations beyond the
  end are rejected. Normal sampler validation still applies.
- This contract requires a source-generated cumulative frame, not raw deltas.
  Sources own completeness and replay identity; the manager cannot discover
  omitted units or turn missing data into exact game state.

Async state includes the normal playback fields plus:

| Field               | Meaning                                            |
| ------------------- | -------------------------------------------------- |
| `status`            | `idle`, `loading`, `ready`, `error`, or `disposed` |
| `requestedGameLoop` | Target of the current load, otherwise null         |
| `availableRange`    | The one committed window's bounds, otherwise null  |
| `error`             | Immutable `{ code, message }`, otherwise null      |

During loading, `currentGameLoop`, `units` and selection describe the **last
committed frame**; only `requestedGameLoop` describes the requested future frame.
`playing` is playback intent and may stay true while buffering. `advance()` is a
no-op unless ready and playing: it does not accumulate time during loading.
The host must stop/reset elapsed clock measurement across buffering to avoid
catch-up jumps when it resumes. `pause()` and speed/selection changes made during
loading remain effective when the window arrives. Reaching the endpoint stops
playback. `play()` does not start I/O; initial/error states need an explicit seek.

`seek()` clamps finite targets like the synchronous API. Every new seek cancels
its predecessor with `AbortSignal`, even for the same target. In-window seeks use
the committed sampler without another read and can cancel an outstanding load.
A generation check ignores stale success and failure even if the source ignores
abort. Cancelled/superseded seeks resolve with the current state; they cannot
publish their obsolete frame. Cancellation of actual I/O is cooperative: sources
must honor the signal to release their work.

Load failures resolve with `status: 'error'`, pause playback and retain the last
committed window. `error.code` is `load-failed` for source failures or
`invalid-window` for invalid coverage/cumulative data. Seek again to retry, or
seek inside the retained window to recover without another read. Invalid method
arguments and calls after disposal reject/throw. Subscriber exceptions propagate
after committing state, matching the synchronous API; listeners should not throw.

Selection accepts a tag known in the current window or the already-selected tag.
It survives seeks into earlier windows where that unit has not appeared
(`selectedUnit: null`), without storing an unbounded history of all seen tags.
`cancel()` aborts loading, pauses, clears errors and returns to ready with the old
window or idle with no committed window. Subscriptions are synchronous,
non-immediate and return idempotent unsubscribe functions.

Only one committed sampler is retained; a successful replacement disposes it.
`dispose()` aborts pending work, releases sampler/tag/subscription caches, is
idempotent, and leaves the final frame readable with `status: 'disposed'`.
The injected source remains caller-owned. This is an in-memory loading contract,
not a persistent keyframe store, byte-budgeted cache, prefetcher, parser format or
IPC transport. AbortSignal types use TypeScript's DOM library; runtime code also
runs in Node without a document or window.

## Existing timeline window adapter

```ts
import {
  createAsyncReplayObserver,
  createReplayObserverTimelineSource,
} from '@scnexus/sc2-observer'

const source = createReplayObserverTimelineSource(timeline, 1600)
const observer = createAsyncReplayObserver(source)
await observer.seek(0)
// On teardown, dispose both: the source remains caller-owned.
observer.dispose()
source.dispose()
```

`createReplayObserverTimelineSource(timeline, windowGameLoops = 1600)` owns a
validated copy of an existing parser timeline. Window length must be a positive
safe integer. Loads yield once and honor abort before constructing an immutable
window. Requested loops must be finite and inside the replay duration; the async
manager performs its normal clamping before calling the source.

The adapter uses aligned windows, binary-searches the last cumulative observation
at/before each window start, and copies only subsequent observations through the
window end. The initial frame keeps original type, ownership, completion,
birth/death metadata and the actual position observation loop. Dead units remain
queryable. Synthetic boundary frames have `kind: 'position'` and do not invent a
new birth. Window frames serve spatial sampling; use the original timeline's
event index for the complete lifecycle/event history. Like the async window
contract, already-started tracks require a known cumulative frame at the boundary.

`dispose()` releases the copied timeline and is idempotent. Returned windows stay
valid; later loads reject. The whole original timeline is still resident until
source disposal, and window construction runs on the calling thread. This is a
compatibility adapter, not a Worker, disk chunk store, transport reduction or
solution to peak memory usage.

The textual `ReplayObserver` defaults to this adapter and accepts an optional
caller-owned `source` for the same replay alongside its existing full `timeline`.
The timeline still supplies event history, player filters and track details.
The UI displays loading targets separately from committed time, allows cancelling
and retrying, and keeps old units/analysis during buffering. Before the first
commit it shows an unloaded frame, without reporting zero units as known data.
Late event jumps cannot override a newer selection, and source/timeline replacement
aborts the old session. Playback resets its elapsed timestamp across buffering;
a completed old animation callback cannot restart a disposed or replaced clock.
UI labels are localized, and source error messages are not rendered directly.

## Indexed sampling and performance

Observer sessions keep an in-memory birth-time index and per-unit observation
interval cursors. Sampling within a birth interval skips future units without
scanning the full replay. Within an unchanged observation interval, the session
reuses the observation lookup, while publishing new immutable unit states with
updated position ages. Crossing intervals or seeking backward uses binary search;
unit output remains in the original timeline order, including dead units.
`dispose()` clears the index, cursors, tag lookup and subscriptions; the final
published snapshot remains readable. This is not a streaming or keyframe cache.
The standalone `sampleReplaySpatialTimeline` stays stateless as a reference.

Run the reproducible CPU-only synthetic benchmark with Node 26:

```sh
pnpm --filter @scnexus/sc2-observer benchmark
```

The command builds the package and reports construction time, CPU/runtime,
and sampling p50/p95. Both workloads contain 4,000 units with 32 observations
each: staggered births every 32 loops, and all units present at loop zero.
Sequential queries cover loops 0–511; deterministic random queries cover the
whole workload duration. Each measurement warms up 128 queries, runs 512 queries,
and reports the median of three rounds, alternating stateless/session order.
GC runs after warmup and before each measured round; GC during measurement is
included. Timing is informational, with no hardware-dependent pass threshold.

Example on 2026-11-09, Windows x64, Intel Core Ultra 7 270K Plus,
Node 26.13.0 (milliseconds per query):

| Workload           | Stateless p50 | Session p50 | Stateless p95 | Session p95 |
| ------------------ | ------------: | ----------: | ------------: | ----------: |
| Staggered, opening |        0.0041 |      0.0007 |        0.0055 |      0.0017 |
| Staggered, random  |        0.1463 |      0.1021 |        0.3191 |      0.2361 |
| Dense, opening     |        0.2549 |      0.1310 |        0.3682 |      0.3070 |
| Dense, random      |        0.2766 |      0.2758 |        0.4700 |      0.4789 |

The reference is the stateless sampler, not a historical session benchmark.
Dense random seeks show no meaningful improvement. These figures exclude
parser/IPC cost, UI updates, rendering and peak memory; they do not establish
browser frame rate, real-replay performance or an end-to-end 60 FPS guarantee.
Full immutable snapshots still require work proportional to the sampled units.

## Headless queries

```ts
import { filterReplayObserverUnits, queryReplayObserverEvents } from '@scnexus/sc2-observer'

const units = filterReplayObserverUnits(observer.getState().units, {
  playerId: 1,
  search: 'marine',
  alive: 'alive',
})
const events = queryReplayObserverEvents(timeline, observer.getState().selectedUnitTag ?? undefined)
```

`filterReplayObserverUnits(units, filter)` returns a new immutable array in input
order without modifying units. Optional filters combine: `playerId` matches
`controlPlayerId` exactly (`0` neutral, `null` unknown, omitted all); `search` is
trimmed, case-insensitive substring matching on unit type or tag; `alive` is
`'all' | 'alive' | 'dead'` (omitted means all). Filter sampled units after seeking
to query historical ownership, type and life status without leaking future state.

`queryReplayObserverEvents(timeline, unitTag?)` returns immutable
`{ unitTag, gameLoop, kind }` records for all units or one exact tag. Stable event
kinds are `'born' | 'init' | 'done' | 'died' | 'type' | 'owner'`. Results sort by
loop; ties retain timeline unit order, then observation order. Position updates
are not events. This queries the supplied timeline, not the current playback loop;
callers can restrict results to the current loop when presenting historical text.

Observation `kind` is optional for compatibility with existing structural inputs.
When present, parser kinds are authoritative: `type-change` maps to `type`,
`owner-change` to `owner`, lifecycle kinds retain their names, and `position` is
ignored. Without kind, successive cumulative states reveal completion, type and
control/upkeep ownership changes (same-loop fallback order: done, type, owner).
A first observation at `startedGameLoop` supplies `born` if completed, otherwise
`init`; a later first observation does not invent an unseen start or completion.
`diedGameLoop` supplies death even without a death observation, with no duplicate
when explicit death was recorded. No intervening events or movement are inferred.
Standalone queries, like sampling, expect valid chronological parser timelines.

## Indexed event windows and navigation

```ts
import { createReplayObserverEventIndex } from '@scnexus/sc2-observer'

const events = createReplayObserverEventIndex(timeline)
const page = events.query({
  kind: 'died',
  fromGameLoop: 0,
  toGameLoop: observer.getState().currentGameLoop,
  offset: 0,
  limit: 10,
})
const next = events.next(observer.getState().currentGameLoop, { unitTag: '10:2' })
// The host owns seeking/pausing; querying never changes the observer.
if (next) observer.seek(next.gameLoop)
events.dispose()
```

Construction snapshots the same observed events as `queryReplayObserverEvents`,
then indexes global, unit, kind and unit/kind scopes. It does not retain the input
timeline. Queries combine exact `unitTag`, `kind`, and inclusive `fromGameLoop` /
`toGameLoop` filters. Omitted time bounds cover the whole timeline; set
`toGameLoop` to the current loop to exclude future events. Bounds accept finite
nonnegative fractional loops; reversed ranges throw instead of clamping.

`query()` returns immutable `{ total, events }`, where total is the matching
count before pagination. `offset` defaults to 0 and must be a nonnegative safe
integer. `limit` defaults to 100 and accepts integers from 0 to 1,000 (`0` queries
only the total). `order` defaults to `'asc'`; `'desc'` reverses the complete stable
order, including ties. Unknown units or absent kinds return empty pages. Time
bounds use binary search and only the requested page is copied: query cost is
O(log E + limit) for the selected scope, without filtering the whole collection.
The index still stores the full observed event history in memory.

`previous(loop, filter?)` and `next(loop, filter?)` return the last strictly earlier
or first strictly later event, or null. All events at the current loop are skipped;
time/unit/kind filters apply before navigation. Previous ties choose the last
stable event and next ties the first. These methods use binary search and do not
change selection, playback or pagination. The textual client uses this index for
its existing event list and navigation, replacing page-local event scans.

`dispose()` clears the index and is idempotent; subsequent queries/navigation
throw. Already returned pages remain valid and immutable. Replacing the client
analysis disposes its old index and resets event scope/page as before. This adds
no derived combat events, continuous movement, streaming chunks or disk cache.

## Analysis at the playback loop

```ts
import { sampleReplayObserverAnalysis, summarizeReplayObserverUnits } from '@scnexus/sc2-observer'

const players = sampleReplayObserverAnalysis(insights, observer.getState().currentGameLoop)
const counts = summarizeReplayObserverUnits(observer.getState().units)
```

`sampleReplayObserverAnalysis(input, gameLoop)` accepts a structural subset of
`ReplayInsights`: `players` with `playerId`, optional `slot` and `name`, `economy`
samples and `production` events. No dependency on app-shared is required. It returns
an immutable array in input player order, including players without observations:

- `playerId`, `slot`, `name`: player identity; missing slot/name become null.
- `economy`: the latest sample at or before the query loop, or null before the
  first sample. Contains `gameLoop` and supported numeric fields supplied by that
  sample, including minerals, vespene, incomes, workers, supplyUsed, supplyCap,
  current/in-progress resource stocks and recorded lost/killed/friendly-fire
  resource counters. Missing optional fields stay absent; zero and null retain
  their meanings. Unknown fields are omitted.
- `economyAgeGameLoops`: query loop minus sample loop, or null without a sample.
- `production`: at most the latest **10** observed records, ordered by loop, each
  containing only `{ observationGameLoop, kind, name, count }`. `kind` retains
  the input production kind. A record appears only when its `gameLoop` is at or
  before the query loop. Inferred start/end loops, timing metadata and future
  completion records are never exposed as current production or completion.
- `observedProductionEventCount`: total records observed through the query loop,
  including records outside the recent ten. Label this **observed production
  events**, not trained units; records may describe starts, completions or morphs,
  and `count` may be null.

Economy values are last sampled, without interpolation. Loss values such as
`lostArmyMinerals` and `lostArmyVespene` come only from that economy sample; no
whole-game metrics, future totals, costs or inferred kills enter the snapshot.
Queries are independent, so seeking backward removes future information.
Query and input observation loops must be finite and nonnegative; invalid loops
throw `RangeError`. Fractional loops are accepted, with no duration clamping.
Unsorted inputs are supported without mutation: equal-loop economy samples use
last input order, and production ties preserve input order (the recent ten retain
the last ten tied records). Each query scans observations but retains only ten
production references before creating immutable normalized records; it does not
copy or sort the complete production history. Results are detached from input
objects; inputs remain mutable and callers must not mutate them during a query.

`summarizeReplayObserverUnits(units)` groups sampled units by `controlPlayerId`
(including neutral `0` and unknown `null`), retaining first-seen player order.
Each immutable `{ playerId, alive, dead, underConstruction }` summary counts raw
recorded entities. `underConstruction` counts living entities with
`completed: false` and is a subset of `alive`. These are not army counts, trained
unit counts, combat losses or inferred kills; absent players have no summary.

## Development

From the workspace root:

```sh
pnpm --filter @scnexus/sc2-observer build
pnpm --filter @scnexus/sc2-observer typecheck
pnpm --filter @scnexus/sc2-observer test
```

Like the existing replay-parser tools package, workspace exports point to
TypeScript source; `build` also emits JavaScript and declarations into `dist`.
