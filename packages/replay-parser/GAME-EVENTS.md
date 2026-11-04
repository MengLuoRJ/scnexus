# replay.game.events

`parseReplayGameEvents(bytes, baseBuild, { maxEvents?, allowUnverified? })` accepts the **decompressed component**, not an MPQ archive. Exported from `@scnexus/replay-parser`, with `ReplayGameEvent`, `ReplayGameEvents`, `ReplayGameParseOptions` and `SUPPORTED_REPLAY_GAME_BASE_BUILDS`.

Official builds are grouped by the structural fingerprint of their reachable game-event protocol, including event names, fields and root types. `SUPPORTED_REPLAY_GAME_BASE_BUILDS` lists official registry coverage, not a two-build runtime whitelist. A registered build uses its group's representative schema; a different build number alone is not a compatibility failure. This capability remains independent of tracker/initData decoding.

For an unregistered positive build, the default is a bounded trial of at most three distinct protocol groups nearest by distance to any official member build. Every candidate must decode the complete stream within the same resource limits. All successful candidates must agree on every decoded event (including known events omitted from the returned timeline); disagreement is rejected. Success is **unverified**, never proof of semantic compatibility. Empty unknown streams cannot establish compatibility. Set `allowUnverified: false` to require official registry coverage. No result is returned if all candidates fail or if successful candidates disagree.

The return value contains the original `baseBuild`, `protocolVersion` (`s2protocol-${protocolBuild}` identifying the schema actually used), `compatibility` (`state: verified | unverified`, `protocolBuild`, `candidateBuilds`), `algorithmVersion`, `processedEvents`, `skippedEvents`, and `events`. The application persists compatibility provenance, marks trial analysis as partial and displays a persistent warning with source and decoder builds. Unverified commands must not be used as verified statistics or training-start evidence. Retained events contain `eventId`, `eventType`, cumulative `gameLoop`, original numeric `userId` (`-1` when the historical protocol has no user prefix), and `data` with unchanged Blizzard field names:

- `NNet.Game.SCmdEvent`: `m_cmdFlags`, optional `m_abil` (`m_abilLink`, `m_abilCmdIndex`, optional `m_abilCmdData`), `m_data` (choice `None`, `TargetPoint`, `TargetUnit`, or `Data`), `m_sequence`, optional `m_otherUnit`, optional `m_unitGroup`.
- `NNet.Game.SSelectionDeltaEvent`: raw selection delta, subgroup and unit-tag evidence.
- `NNet.Game.SControlGroupUpdateEvent`: raw group index, update and mask evidence.

Ability link/index are **raw protocol identifiers**, not names or training/movement classifications. User ids are not tracker player ids or lobby slots. Selection deltas do not reconstruct current selections. Game loops use game-time units, not Faster-speed wall-clock seconds. No APM/EPM or build-order interpretation is provided.

All other known event bodies are decoded and discarded to preserve exact stream boundaries. Counts include these discarded events. Unknown ids throw immediately because bit-packed events have no independent payload length. Truncation/malformed bodies throw; no partial success or guessed boundary is returned. Empty input yields a genuinely empty result.

Limits: 32 MiB input, at most 100,000 processed events (caller may lower this), 1,000,000 decoded nodes **across the stream**, nesting depth 64, arrays 100,000 elements and bitarrays 65,536 bits. Integer precision is preserved using decimal strings outside the JSON-safe integer range. Binary blobs use the existing `{ kind: 'blob', hex, text }` representation.

## Complete official protocol coverage

The shared, interned TypeScript data in `src/protocols/official-data.ts` derives from **all 93** modules in Blizzard MIT-licensed [s2protocol commit 3b40c5ef01834096b4305172ef5485ec00133dcc](https://github.com/Blizzard/s2protocol/tree/3b40c5ef01834096b4305172ef5485ec00133dcc), builds 15405 through 98310. Every downloaded source was checked against its Git blob SHA in that immutable tree. The ordered `build:SHA256\n` source manifest has aggregate SHA-256 `5251bc90106bbe05bca742656810545de1170925f73e2c48ffbd447732cfbb50`. Permission notices remain in [LICENSE.s2protocol](./LICENSE.s2protocol). Python, downloaded source files and generators are not runtime/build/test dependencies and are not committed.

Structurally identical reachable roots share data: **17 initData, 14 game, 5 message, 3 tracker, 3 header and 7 details groups**, using 452 interned types. Tracker events did not exist in the earliest protocols; known tracker-capable builds select their exact official schema, while unknown builds retain explicitly self-describing Versioned tracker decoding. `SUPPORTED_REPLAY_BASE_BUILDS` and `SUPPORTED_REPLAY_GAME_BASE_BUILDS` enumerate exact official membership. Non-official observed builds such as 95841/96163/96314/96516 are not verified aliases. Build 62848 is officially supported.

Known builds never retry another schema on corruption. Unknown initData/game/message builds may try at most three nearest distinct structural groups, accepting only complete, unambiguous decoding as **unverified**. InitData compares successive candidates without retaining three copies; game/message candidates compare events incrementally without retaining candidate timelines, then decode only the selected stream into the result. Candidate evidence is compared structurally (including event headers, nested fields, array order and raw blobs), without serializing or sorting every event; object field insertion order is not evidence. A disagreement remains recorded until complete consumption determines which candidates succeeded, including candidates that fail on a later event. Candidate distances are computed once per group before ranking. Shared types are not cloned per build. Metadata validates exact known header/details schemas; callers may pass `baseBuild` as the second argument to `parseReplayDetails`.

`parseReplayMessageEvents(bytes, baseBuild, { maxEvents?, allowUnverified? })` decodes complete message bodies, including chat/ping/loading variants. It preserves official event names (for example `NNet.Game.SChatMessage`), raw fields and blob evidence. UTF-8 decoding is fatal: non-UTF-8 blobs keep `text: null` and the exact `hex`, without replacement characters or guessed legacy encodings. Historical streams without a user prefix return `userId: -1`; do not treat that sentinel as an account identity.

`elapsedGameLoops` includes non-retained game events; empty known streams report zero. This is observed stream duration, not confirmed mission completion time.

Run from repository root:

```powershell
pnpm --filter @scnexus/replay-parser run format:check
pnpm --filter @scnexus/replay-parser run typecheck
pnpm --filter @scnexus/replay-parser run test
pnpm --filter @scnexus/replay-parser run lint
```

Tests cover complete synthetic initData for every official build, every game-event body in each distinct group, reachable root validity and exact membership, old user-prefix absence, message variants, known corruption, bounded unknown trials and ambiguity (including discarded game events), integer precision and resource ceilings. Synthetic wire writers are not an independent semantic oracle. Hand-written command/chat payloads supplement them. No replay archive, binary/JSON fixtures or saved Python oracle output is committed; real replay compatibility remains a separate host-level validation.
