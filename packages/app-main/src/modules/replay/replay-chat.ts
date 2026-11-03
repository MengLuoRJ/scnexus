import type { ReplayMessageEvents, ReplayTrackerEvents } from '@scnexus/replay-parser'
import type { ReplayAnalysis, ReplayPlayer } from '@scnexus/app-shared/types/replay.type'

const id = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 255
    ? value
    : null

export function buildReplayChat(
  message: ReplayMessageEvents | null,
  tracker: ReplayTrackerEvents | null,
  players: ReplayPlayer[],
): NonNullable<ReplayAnalysis['chat']> {
  if (!message) return { state: 'unavailable', messages: [], warnings: [] }
  const setups = new Map<number, { playerId: number; slot: number } | null>()
  const playerUsers = new Map<number, Set<number>>()
  const slotUsers = new Map<number, Set<number>>()
  for (const event of tracker?.events ?? []) {
    if (event.eventType !== 'NNet.Replay.Tracker.SPlayerSetupEvent') continue
    const userId = id(event.data.m_userId)
    const playerId = id(event.data.m_playerId)
    const slotId = id(event.data.m_slotId)
    if (userId === null || playerId === null || playerId === 0 || slotId === null) continue
    const previous = setups.get(userId)
    const mapping = { playerId, slot: slotId + 1 }
    setups.set(
      userId,
      previous === null ||
        (previous && (previous.playerId !== playerId || previous.slot !== mapping.slot))
        ? null
        : mapping,
    )
    const users = playerUsers.get(playerId) ?? new Set<number>()
    users.add(userId)
    playerUsers.set(playerId, users)
    const slots = slotUsers.get(mapping.slot) ?? new Set<number>()
    slots.add(userId)
    slotUsers.set(mapping.slot, slots)
  }
  let partial = message.compatibility.state === 'unverified'
  const warnings = new Set<string>()
  if (partial) warnings.add('Message protocol compatibility is unverified')
  const messages: NonNullable<ReplayAnalysis['chat']>['messages'] = []
  for (const event of message.events) {
    if (event.eventType !== 'NNet.Game.SChatMessage') continue
    const raw = event.data.m_string
    const text =
      typeof raw === 'string'
        ? raw
        : raw &&
            typeof raw === 'object' &&
            !Array.isArray(raw) &&
            'kind' in raw &&
            raw.kind === 'blob'
          ? raw.text
          : null
    const recipient = id(event.data.m_recipient)
    if (typeof text !== 'string' || recipient === null) {
      partial = true
      warnings.add('A chat event has invalid text or recipient data')
      continue
    }
    const candidate = setups.get(event.userId)
    const mapping =
      candidate &&
      playerUsers.get(candidate.playerId)?.size === 1 &&
      slotUsers.get(candidate.slot)?.size === 1
        ? candidate
        : null
    const matches = mapping ? players.filter((player) => player.slot === mapping.slot) : []
    if (!mapping || matches.length !== 1) {
      partial = true
      warnings.add('Some chat users could not be uniquely mapped to replay participants')
    }
    messages.push({
      gameLoop: event.gameLoop,
      userId: event.userId,
      playerId: mapping?.playerId ?? null,
      slot: mapping?.slot ?? null,
      name: matches.length === 1 ? matches[0]!.name : null,
      recipient,
      text,
    })
  }
  return { state: partial ? 'partial' : 'available', messages, warnings: [...warnings] }
}
