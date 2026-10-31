import type { ReplayPlayer } from '@scnexus/app-shared/types/replay.type'

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

export function replayResultClass(result: ReplayPlayer['result']): string {
  return result === 'win' ? 'text-success' : result === 'loss' ? 'text-error' : 'text-muted'
}
