# replay.game.events

`parseReplayGameEvents(bytes, baseBuild, { maxEvents?, allowUnverified? })` accepts the **decompressed component**, not an MPQ archive. Exported from `@scnexus/replay-parser`, with `ReplayGameEvent`, `ReplayGameEvents`, `ReplayGameParseOptions` and `SUPPORTED_REPLAY_GAME_BASE_BUILDS`.

Official builds are grouped by the structural fingerprint of their reachable game-event protocol, including event names, fields and root types. `SUPPORTED_REPLAY_GAME_BASE_BUILDS` lists official registry coverage, not a two-build runtime whitelist. A registered build uses its group's representative schema; a different build number alone is not a compatibility failure. This capability remains independent of tracker/initData decoding.

For an unregistered positive build, the default is a bounded trial of at most three distinct protocol groups nearest by representative build. Every candidate must decode the complete stream within the same resource limits. All successful candidates must agree on every decoded event (including known events omitted from the returned timeline); disagreement is rejected. Success is **unverified**, never proof of semantic compatibility. Empty unknown streams cannot establish compatibility. Set `allowUnverified: false` to require official registry coverage. No result is returned if all candidates fail or if successful candidates disagree.

The return value contains the original `baseBuild`, `protocolVersion` (`s2protocol-${protocolBuild}` identifying the schema actually used), `compatibility` (`state: verified | unverified`, `protocolBuild`, `candidateBuilds`), `algorithmVersion`, `processedEvents`, `skippedEvents`, and `events`. The application persists compatibility provenance, marks trial analysis as partial and displays a persistent warning with source and decoder builds. Unverified commands must not be used as verified statistics or training-start evidence. Retained events contain `eventId`, `eventType`, cumulative `gameLoop`, original numeric `userId`, and `data` with unchanged Blizzard field names:

- `NNet.Game.SCmdEvent`: `m_cmdFlags`, optional `m_abil` (`m_abilLink`, `m_abilCmdIndex`, optional `m_abilCmdData`), `m_data` (choice `None`, `TargetPoint`, `TargetUnit`, or `Data`), `m_sequence`, optional `m_otherUnit`, optional `m_unitGroup`.
- `NNet.Game.SSelectionDeltaEvent`: raw selection delta, subgroup and unit-tag evidence.
- `NNet.Game.SControlGroupUpdateEvent`: raw group index, update and mask evidence.

Ability link/index are **raw protocol identifiers**, not names or training/movement classifications. User ids are not tracker player ids or lobby slots. Selection deltas do not reconstruct current selections. Game loops use game-time units, not Faster-speed wall-clock seconds. No APM/EPM or build-order interpretation is provided.

All other known event bodies are decoded and discarded to preserve exact stream boundaries. Counts include these discarded events. Unknown ids throw immediately because bit-packed events have no independent payload length. Truncation/malformed bodies throw; no partial success or guessed boundary is returned. Empty input yields a genuinely empty result.

Limits: 32 MiB input, at most 100,000 processed events (caller may lower this), 1,000,000 decoded nodes **across the stream**, nesting depth 64, arrays 100,000 elements and bitarrays 65,536 bits. Integer precision is preserved using decimal strings outside the JSON-safe integer range. Binary blobs use the existing `{ kind: 'blob', hex, text }` representation.

## Protocol provenance and retained regression fixtures

The TypeScript schemas were derived from Blizzard MIT-licensed [s2protocol commit 901804e41283269d43d7bfc3b8dc5be2a9dd350a](https://github.com/Blizzard/s2protocol/tree/901804e41283269d43d7bfc3b8dc5be2a9dd350a). The Python generation tools, vendored Python sources and caches were removed after validation. Python is not required for development, tests, builds or runtime. Source paths and hashes remain in [game-protocol-sources.json](./src/protocols/game-protocol-sources.json); permission notices remain in [LICENSE.s2protocol](./LICENSE.s2protocol).

SHA-256:

| Source           | Hash                                                               |
| ---------------- | ------------------------------------------------------------------ |
| protocol70154.py | `8985728c2cbf7878a1023e24d1a9c5338c99d7780d778c0fc12f4e971265ad4f` |
| protocol98310.py | `2941e39e970c21bfa7bb9c5c6d340c09366a5743f223b516fe19443f67c578e5` |
| decoders.py      | `04be2825828aabc1a73268298cb5e0d44fcf5940b8dd2fa606b38fd70b1d5aaa` |
| compat.py        | `da5fff8ae19c5ac01d83e0c80d60853aeffd817deaa57d6d14dcaad1f3153c3f` |

Run from repository root:

```powershell
pnpm --filter @scnexus/replay-parser run format
pnpm --filter @scnexus/replay-parser run typecheck
pnpm --filter @scnexus/replay-parser run test
pnpm --filter @scnexus/replay-parser run lint
```

Runtime uses the TypeScript `ReplayBitReader`/`ProtocolDecoder`. Generated protocol data is retained as source code; no generation step is needed for normal builds.

Binary fixtures are **synthetic**, not real player replays. Each contains every known event followed by four rich commands (all target choice arms, all delta widths), selection and control-group data. The pinned **official Python decoder** decodes each 108-event stream before expected JSON is emitted; Vitest compares every retained payload and metadata with that result. This is a cross-implementation wire-format check, not evidence of real-world replay coverage. Upstream sources are never sent local project data.

## Generated official game compatibility groups

The retained registry covers **all 47 official protocol modules with baseBuild >= 70154**
listed by the pinned upstream Git tree, through 98310. These collapse to two reachable
structural schemas: source build **70154** (20 builds, through 78285) and **80669**
(27 builds, through 98310). Membership is explicit, not an inclusive numeric range.
There are no official sources for intermediate unlisted builds in this pinned tree.

`src/protocols/game-registry.ts` exports `GAME_PROTOCOL_GROUPS`, with each group
containing `sourceBuild`, `builds`, `schema`, and a SHA-256 `fingerprint`.
`findReplayGameProtocol(baseBuild)` returns an exact source-verified group or
`undefined`; the registry itself never chooses candidates for unknown builds.
Source-verified means equivalence to a pinned official protocol, not real-replay
fixture coverage. Existing game70154/game98310 fixture schemas remain available;
only one additional schema module (game-group-80669) is generated.

Fingerprints include the reachable delta/user/event-id root roles and all event
ids/names, field names/order/tags, choice tags/names, primitive kinds, bounds and
nested structure. Deterministic structural interning removes upstream type-id
numbering and duplicate-type-sharing differences. Unreachable types are ignored.
Cycles and unsupported kinds fail generation instead of silently weakening identity.

[game-protocol-sources.json](./src/protocols/game-protocol-sources.json) records the repository, immutable commit, official source paths and SHA-256 of the original inputs. [game-protocol-groups.json](./src/protocols/game-protocol-groups.json) records complete membership and structural fingerprints. These are provenance records, not executable generators.

To update protocols, retrieve the official sources at the pinned commit (or deliberately review a new commit), verify their hashes and license, derive reachable schemas and compare structural groups. The removed scripts and automatic generation checks are no longer available in this repository; future updates need an explicitly reviewed generation workflow. Do not edit registry membership merely because a build number is nearby.

The retained `.bin` and `.json` fixtures are required by regression tests. They were previously cross-checked with the pinned official Python decoder; normal tests consume the saved results and do not execute Python. Removing Python tools does not make these synthetic fixtures evidence of real-world replay coverage.
