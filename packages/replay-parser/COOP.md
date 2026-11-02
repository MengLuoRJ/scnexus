# Co-op replay analysis

`identifyReplayCoop(initData: ReplayInitData | null): ReplayCoopSummary` is a fast, archive-I/O-free classifier. It only trusts the explicit `m_syncLobbyState.m_gameDescription.m_isCoopMode` boolean. Missing evidence is `unknown`, not a negative classification. Commander names, map names, allied teams and directory categories are not substitutes for this flag.

`parseReplayCoop(initData: ReplayInitData | null, tracker: ReplayTrackerEvents | null): ReplayCoopAnalysis` adds bounded tracker lifecycle analysis. Both functions and `REPLAY_COOP_ANALYSIS_VERSION` are exported from the parser entry point. Shared serializable DTOs mirror these structures in app-shared. The main-process adapter re-exports the classifier and aliases the analyzer as `buildReplayCoop`.

## Evidence and limitations

- Participants use actual zero-based lobby slot IDs, non-null user IDs and `m_observe === 0`. Account association uses the raw toon handle, never an assumed player ordering. Tracker player IDs are established only by matching both slot and user IDs in `SPlayerSetupEvent`.
- Commander, level, mastery level, talent allocation, prestige, difficulty and Brutal+ are raw initData fields. Missing fields are null; old builds do not get a fabricated default prestige. Difficulty/prestige values are not translated via unverified mappings.
- Retry mutation indexes are retained as raw indexes, **not** active mutator IDs. Active mutator names and completeness remain unknown. Tracker player-zero upgrade IDs beginning with `mutatorinfo` are exposed verbatim as raw observations with `source: tracker-upgrade` and unknown completeness; they are not interpreted through an upstream ID/name table. Enemy race and wave-type IDs are exposed as raw values without claiming a named composition. InitData rewards are unlock data, not earned mission experience; earned rewards remain unknown.
- Unit rows are raw per-player/per-type lifecycle counts. `born` counts Born events (including preplaced entities); `started` counts Init events; `completed` counts Born or the first Done following Init. They are not equivalent to trained combat units. Type changes and ownership changes do not create another birth. Deaths use the last observed owner/type. Kill attribution uses the explicit killer player and, when consistent, the killer unit tag. Unknown killer types have a dedicated `<unknown-killer-unit>` row. Friendly kills, neutral entities, buildings and summons are not silently excluded.
- Full index/recycle pairs isolate unit generations. Duplicate births/deaths, orphan lifecycle events and missing kill attribution produce partial results instead of invented counts. Commander-specific morph, revival, sacrifice, despawn and summon corrections are not claimed. `corrections: lifecycle-only` explicitly restricts the applied corrections.
- Observed time is the last tracker loop divided by **16**. It is neither confirmed mission completion nor Faster-speed wall-clock time. No universal 1.4 multiplier or generic damage model is applied.
- GPL research was used only to understand the existence of raw metadata fields. No upstream code, translated implementation, mappings or gameplay tables are included.

## Validation

`pnpm --filter @scnexus/replay-parser run test` covers explicit classification, raw blob metadata, missing fields, observers, player setup, production/completion, ownership, morphs, recycled tags, duplicate/orphan events and unknown attribution. Existing committed real fixtures cover game-event streams (builds 70154 and 98310), not co-op initData/tracker streams. Co-op tests are synthetic protocol-shaped events; they do not establish broad real-map or commander-rule coverage. No `.SC2Replay` archive fixture is committed in this repository.

## Protocol evidence and special events (coop-v2)

The committed MIT-attributed Blizzard protocol descriptions are the schema evidence, not a claim of real replay fixture validation:

| Field                                                | Build 70154                     | Build 98310                     | Output                       |
| ---------------------------------------------------- | ------------------------------- | ------------------------------- | ---------------------------- |
| gameDescription.m_isCoopMode                         | schema type 59, boolean type 13 | schema type 59, boolean type 13 | explicit identification      |
| slot.m_commander                                     | blob type 46                    | blob type 46                    | raw blob.text, no name table |
| slot.m_commanderLevel                                | uint32 type 6                   | uint32 type 6                   | level                        |
| slot.m_commanderMasteryLevel                         | uint32 type 6                   | uint32 type 6                   | masteryLevel                 |
| slot.m_commanderMasteryTalents                       | array type 66                   | array type 66                   | raw talent allocation        |
| slot.m_selectedCommanderPrestige                     | absent                          | uint32 type 6                   | prestige, null on old schema |
| slot.m_brutalPlusDifficulty / m_retryMutationIndexes | absent                          | type 6 / array type 66          | raw difficulty and indexes   |
| slot.m_aCEnemyRace / m_aCEnemyWaveType               | absent                          | uint32 type 6                   | raw composition identifiers  |

The property is **m_selectedCommanderPrestige**, not m_prestige. Commander identifiers and numeric difficulty/prestige are preserved, not translated. Only exact initData builds 70154 and 98310 are currently dispatched; unsupported initData builds remain unknown, even though Versioned tracker decoding supports positive source builds.

Stable tracker schema event 5 (`SUpgradeEvent`, struct 203) exposes `m_playerId`, blob `m_upgradeTypeName` and signed `m_count`. `upgrades.events` retains observable nonnegative counts with the full raw ID, source and loop/16 time. Player-zero `mutatorinfo` prefix evidence is recognized as a mod-reported raw marker, with duplicate IDs collapsed only in the summary; the full event sequence and counts remain available. This also works with unknown initData identity for arcade evidence, without promoting it into confirmed co-op. No GPL lookup table or commander-upgrade mapping is copied. Commander/mastery/prestige upgrade fallback is not enabled: the protocol defines the event shape, **not** the semantic mapping of arbitrary map-authored upgrade names to commanders/talents. The available GPL research relies on such mapping tables and is not an independent verification source for porting them.

`bonusObjectives` explicitly describes **bonus objective completion times**, separately from experience: `state: unknown`, `completionTimesSeconds: null`, with a reason. The tracker schema has no generic objective-completed event. Research implementations infer map-specific success from named unit deaths/morphs, owner IDs, coordinates and timing offsets. Without independently verified map rules and real fixtures, a death can be a despawn, failure or cancellation; those heuristics are not asserted as completed bonuses here. `timing` remains observed tracker extent only.

No commander-specific unit-value, revive, summon, salvage or morph mapping is enabled without independent evidence. Applied corrections are limited to duplicate completion/death suppression, ownership/type updates and full index/recycle lifecycle isolation. Tests cover these exact semantics, not universal commander gameplay rules.
