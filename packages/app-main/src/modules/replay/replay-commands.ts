import type { ReplayGameEvents } from '@scnexus/replay-parser'
import type { ReplayAnalysis } from '@scnexus/app-shared/types/replay.type'

/** Retain the game-event user namespace; it is not the tracker player/slot namespace. */
export function buildReplayCommands(
  game: ReplayGameEvents,
): NonNullable<ReplayAnalysis['commands']> {
  return game.events
    .filter((event) => event.eventType === 'NNet.Game.SCmdEvent')
    .map((event) => {
      const ability = event.data.m_abil
      const fields =
        ability && typeof ability === 'object' && !Array.isArray(ability) && !('kind' in ability)
          ? ability
          : null
      const number = (value: unknown) =>
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
      return {
        gameLoop: event.gameLoop,
        userId: event.userId,
        abilityLink: number(fields?.m_abilLink),
        abilityIndex: number(fields?.m_abilCmdIndex),
        flags: number(event.data.m_cmdFlags) ?? 0,
      }
    })
}
