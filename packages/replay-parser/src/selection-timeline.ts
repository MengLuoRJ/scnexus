import type { ReplayGameEvents } from './game-events.js'

export type ReplaySelectionReason =
  | 'unverified-protocol'
  | 'invalid-selection'
  | 'unsupported-update'
  | 'budget-exceeded'
/** Earlier recorded selection; membership does not identify which unit executed a command. */
export type ReplaySelectionObservation = {
  eventIndex: number
  gameLoop: number
  userId: number
  unitTags: number[] | null
  reason: ReplaySelectionReason | null
}
type Selection = { tags: number[] | null; reason: ReplaySelectionReason | null }
const empty = (): Selection => ({ tags: [], reason: null })
const invalid = (): Selection => ({ tags: null, reason: 'invalid-selection' })
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
function integer(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maximum
}
function merge(selection: Selection, additions: unknown): Selection {
  if (
    !Array.isArray(additions) ||
    additions.length > 512 ||
    additions.some((tag: unknown) => !integer(tag, 0xffffffff))
  )
    return invalid()
  if (!selection.tags) return selection
  const tags = [...new Set<number>([...selection.tags, ...(additions as number[])])].sort(
    (a, b) => a - b,
  )
  return tags.length <= 512 ? { tags, reason: null } : invalid()
}
function remove(selection: Selection, value: unknown): Selection {
  const choice = record(value)
  if (!choice) return invalid()
  // Older protocols encode a bit array directly instead of wrapping it in a choice.
  if (Object.hasOwn(choice, 'bitLength')) return mask(selection, choice)
  if (Object.keys(choice).length !== 1) return invalid()
  if (choice.None === null) return selection
  if (Object.hasOwn(choice, 'Mask')) return mask(selection, record(choice.Mask))
  const keep = Object.hasOwn(choice, 'ZeroIndices')
  const indices = keep ? choice.ZeroIndices : choice.OneIndices
  if (
    !Array.isArray(indices) ||
    indices.length > 512 ||
    indices.some((index: unknown) => !integer(index, 511)) ||
    new Set(indices).size !== indices.length
  )
    return invalid()
  if (keep && indices.length === 0) return empty()
  if (!selection.tags) return selection
  if (indices.some((index: number) => index >= selection.tags!.length)) return invalid()
  const positions = new Set<number>(indices)
  return { tags: selection.tags.filter((_, index) => positions.has(index) === keep), reason: null }
}
function mask(selection: Selection, fields: Record<string, unknown> | null): Selection {
  if (
    !fields ||
    !integer(fields.bitLength, 512) ||
    !integer(fields.bitOffset, 7) ||
    typeof fields.value !== 'string' ||
    !/^(0|[1-9][0-9]{0,154})$/.test(fields.value)
  )
    return invalid()
  const length = fields.bitLength
  const bits = BigInt(fields.value)
  if (bits >= 1n << BigInt(length)) return invalid()
  if (!selection.tags) return selection
  if (length > selection.tags.length) return invalid()
  const removed = new Set<number>()
  let consumed = 0
  let offset = fields.bitOffset
  while (consumed < length) {
    const width = Math.min(8 - offset, length - consumed)
    const chunk = bits >> BigInt(length - consumed - width)
    for (let bit = 0; bit < width; bit++) {
      if ((chunk & (1n << BigInt(bit))) !== 0n) removed.add(consumed + bit)
    }
    consumed += width
    offset = 0
  }
  return { tags: selection.tags.filter((_, index) => !removed.has(index)), reason: null }
}

/** Reconstruct command-time selection evidence from one complete, ordered game-event stream. */
export function buildReplaySelectionTimeline(game: ReplayGameEvents): ReplaySelectionObservation[] {
  if (game.events.length > 100_000) throw new RangeError('Replay selection event limit exceeded')
  const users = new Map<number, Selection[]>()
  const result: ReplaySelectionObservation[] = []
  let previousLoop = -1
  let retainedTags = 0
  let exhausted = false
  for (const [eventIndex, event] of game.events.entries()) {
    if (
      !Number.isSafeInteger(event.gameLoop) ||
      event.gameLoop < 0 ||
      event.gameLoop < previousLoop
    )
      throw new RangeError('Replay selection events must be ordered')
    previousLoop = event.gameLoop
    const verified = game.compatibility?.state === 'verified' && integer(event.userId, 31)
    let groups = users.get(event.userId)
    if (verified && !groups) {
      groups = Array.from({ length: 11 }, empty)
      users.set(event.userId, groups)
    }
    if (event.eventType === 'NNet.Game.SCmdEvent') {
      let selection: Selection = verified
        ? groups![10]!
        : {
            tags: null,
            reason:
              game.compatibility?.state === 'verified'
                ? 'invalid-selection'
                : 'unverified-protocol',
          }
      if (retainedTags + (selection.tags?.length ?? 0) > 250_000) exhausted = true
      if (exhausted) selection = { tags: null, reason: 'budget-exceeded' }
      retainedTags += selection.tags?.length ?? 0
      result.push({
        eventIndex,
        gameLoop: event.gameLoop,
        userId: event.userId,
        unitTags: selection.tags?.slice() ?? null,
        reason: selection.reason,
      })
    } else if (verified && event.eventType === 'NNet.Game.SSelectionDeltaEvent') {
      const group = event.data.m_controlGroupId
      const delta = record(event.data.m_delta)
      if (!integer(group, 10) || !delta) {
        groups!.fill(invalid())
        continue
      }
      groups![group] = merge(remove(groups![group]!, delta.m_removeMask), delta.m_addUnitTags)
    } else if (verified && event.eventType === 'NNet.Game.SControlGroupUpdateEvent') {
      const group = event.data.m_controlGroupIndex
      const update = event.data.m_controlGroupUpdate
      if (!integer(group, 9) || !integer(update, 2)) {
        groups!.fill({ tags: null, reason: 'unsupported-update' })
        continue
      }
      if (update === 0) groups![group] = groups![10]!
      if (update === 1) {
        const active = groups![10]!
        groups![group] = active.tags
          ? merge(remove(groups![group]!, event.data.m_mask), active.tags)
          : active
      }
      if (update === 2) groups![10] = remove(groups![group]!, event.data.m_mask)
    }
  }
  return result
}
