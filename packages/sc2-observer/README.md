# @scnexus/sc2-observer

MIT-licensed, pure TypeScript headless playback manager for the observed spatial
history returned by `@scnexus/replay-parser`'s `buildReplaySpatialTimeline`.
No filesystem, Electron, browser, Vue, timers, or runtime dependencies.

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

## Development

From the workspace root:

```sh
pnpm --filter @scnexus/sc2-observer build
pnpm --filter @scnexus/sc2-observer typecheck
pnpm --filter @scnexus/sc2-observer test
```

Like the existing replay-parser tools package, workspace exports point to
TypeScript source; `build` also emits JavaScript and declarations into `dist`.
