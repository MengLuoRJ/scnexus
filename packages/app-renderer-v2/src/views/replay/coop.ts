import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import type { ReplayCoopPlayer } from '@scnexus/app-shared/types/replay-coop.type'

export function replayCoopProfilePlayer(record: ReplayRecord): ReplayCoopPlayer | null {
  if (!record.profileHandle || record.coop?.identification !== 'confirmed') return null
  const matches = record.coop.players.filter(
    (player) => player.profileHandle === record.profileHandle,
  )
  return matches.length === 1 ? matches[0]! : null
}
