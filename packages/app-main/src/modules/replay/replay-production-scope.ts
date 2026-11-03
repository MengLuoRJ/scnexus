import type { ReplayAttributes, ReplayInitData } from '@scnexus/replay-parser'
import type { ReplayPlayer } from '@scnexus/app-shared/types/replay.type'

/** Conservative timing-model gate; private/extension games retain observed production only. */
export function isStandardReplayMelee(
  initData: ReplayInitData | null,
  attributes: ReplayAttributes | null,
  players: ReplayPlayer[],
): boolean {
  const state = initData?.data.m_syncLobbyState
  if (!state || typeof state !== 'object' || Array.isArray(state) || 'kind' in state) return false
  const description = state.m_gameDescription
  if (
    !description ||
    typeof description !== 'object' ||
    Array.isArray(description) ||
    'kind' in description
  )
    return false
  const options = description.m_gameOptions
  if (!options || typeof options !== 'object' || Array.isArray(options) || 'kind' in options)
    return false
  const attribute = (id: number, value: string) =>
    attributes?.attributes.some(
      (entry) => entry.scope === 16 && entry.attributeId === id && entry.value === value,
    )
  return (
    description.m_isBlizzardMap === true &&
    description.m_isCoopMode === false &&
    description.m_hasExtensionMod === false &&
    options.m_cooperative === false &&
    options.m_amm === true &&
    attribute(3009, 'Amm') === true &&
    attribute(2001, '1v1') === true &&
    players.length === 2 &&
    players.every((player) => player.team !== null) &&
    players[0]!.team !== players[1]!.team
  )
}
