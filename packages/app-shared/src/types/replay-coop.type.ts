/** Serializable co-op DTO; null/unknown means the replay does not establish the value. */
export type ReplayCoopPlayer = {
  slotId: number
  userId: number | null
  playerId: number | null
  profileHandle: string | null
  commander: string | null
  level: number | null
  prestige: number | null
  masteryLevel: number | null
  masteryTalents: number[] | null
  difficulty: number | null
  brutalPlus: number | null
  retryMutationIndexes: number[] | null
}
export type ReplayCoopSummary = {
  identification: 'confirmed' | 'not-coop' | 'unknown'
  players: ReplayCoopPlayer[]
  difficulty: number | null
  mutators:
    | { state: 'unknown'; ids: null }
    | {
        state: 'raw'
        ids: string[]
        source: 'tracker-upgrade'
        completeness: 'unknown'
        evidence: {
          eventType: 'NNet.Replay.Tracker.SUpgradeEvent'
          playerId: 0
          match: 'mutatorinfo-prefix'
        }
      }
}
export type ReplayCoopUnitCount = {
  playerId: number
  unitType: string
  born: number
  started: number
  completed: number
  died: number
  kills: number
}
export type ReplayCoopUpgrade = {
  playerId: number
  upgradeId: string
  count: number
  gameLoop: number
  seconds: number
  source: 'tracker-upgrade'
}
export type ReplayCoopAnalysis = ReplayCoopSummary & {
  version: string
  timeBasis: 'game-loops-16'
  units: {
    state: 'available' | 'partial' | 'unknown'
    counts: ReplayCoopUnitCount[]
    unresolvedEvents: number
    corrections: 'lifecycle-only'
  }
  rewards: { state: 'unknown'; experience: null; bonusExperience: null }
  bonusObjectives: { state: 'unknown'; completionTimesSeconds: null; reason: string }
  upgrades: { state: 'available' | 'partial' | 'unknown'; events: ReplayCoopUpgrade[] }
  timing: {
    state: 'available' | 'unknown'
    observedGameLoops: number | null
    observedSeconds: number | null
  }
  enemyComposition: { state: 'raw' | 'unknown'; raceIds: number[]; waveTypeIds: number[] }
  damage: { state: 'unknown' }
  warnings: string[]
}
