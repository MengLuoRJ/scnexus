import { buildReplayCommandTimeline } from '@scnexus/replay-parser'
import type { ReplayGameEvents, ReplaySpatialTimeline } from '@scnexus/replay-parser'

export function buildReplayCommands(game: ReplayGameEvents, spatial?: ReplaySpatialTimeline) {
  return buildReplayCommandTimeline(game, spatial)
}
