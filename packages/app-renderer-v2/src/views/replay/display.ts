import type { ReplayPlayer, ReplayRecord } from '@scnexus/app-shared/types/replay.type'

export function replayProfilePlayer(record: ReplayRecord): ReplayPlayer | null {
  if (!record.profileHandle) return null
  const matches = record.players.filter((player) => player.profileHandle === record.profileHandle)
  return matches.length === 1 ? matches[0]! : null
}

/** Decode replay text once, without interpreting HTML or removing clan tags. */
export function replayPlayerName(name: string | null, unknown: string): string {
  const entities: Record<string, string> = {
    lt: '<',
    gt: '>',
    amp: '&',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }
  return (name ?? unknown)
    .replace(
      /&(#(?:[0-9]{1,7}|x[0-9a-f]{1,6})|lt|gt|amp|quot|apos|nbsp);/gi,
      (entity, key: string) => {
        if (!key.startsWith('#')) return entities[key.toLowerCase()] ?? entity
        const hex = key[1]?.toLowerCase() === 'x'
        const point = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10)
        return point >= 0x20 &&
          point <= 0x10ffff &&
          !(point >= 0xd800 && point <= 0xdfff) &&
          point !== 0x7f
          ? String.fromCodePoint(point)
          : entity
      },
    )
    .replace(/<sp\s*\/>/gi, ' ')
}

export function replayObserverPlayerName(
  players: readonly { playerId: number; name: string | null }[],
  playerId: number | null,
  fallback: string,
): string {
  if (playerId === null || playerId === 0) return fallback
  const matches = players.filter((player) => player.playerId === playerId)
  const name = matches.length === 1 ? matches[0]!.name : null
  return name?.trim() ? `${replayPlayerName(name, fallback)} (#${playerId})` : fallback
}

export function replayResultClass(result: ReplayPlayer['result']): string {
  return result === 'win' ? 'text-success' : result === 'loss' ? 'text-error' : 'text-muted'
}
