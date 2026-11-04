import type { ReplayProtocolValue } from './protocol-decoder.js'
import { UnsupportedReplayProtocolError } from './protocol-schema.js'

/** Decoded protocol values are JSON-safe; field insertion order is not evidence. */
export function equalProtocolValues(a: ReplayProtocolValue, b: ReplayProtocolValue): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!equalProtocolValues(a[i]!, b[i]!)) return false
    }
    return true
  }
  if (Array.isArray(b)) return false
  const left = a as Record<string, ReplayProtocolValue>
  const right = b as Record<string, ReplayProtocolValue>
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  for (const key of keys) {
    if (!Object.hasOwn(right, key) || !equalProtocolValues(left[key]!, right[key]!)) return false
  }
  return true
}

/** Keep only one event per candidate, including known events omitted from the final timeline. */
export function agreeingStreamCandidates<T, E extends ReplayProtocolValue, R>(
  groups: readonly T[],
  decode: (group: T) => Generator<E, R>,
  kind: 'game' | 'message',
): T[] {
  const attempts = groups.map((group) => ({
    group,
    iterator: decode(group),
    failed: false,
    done: false,
    event: undefined as E | undefined,
  }))
  const conflicts = new Set<number>()
  while (attempts.some((attempt) => !attempt.failed && !attempt.done)) {
    for (const attempt of attempts) {
      attempt.event = undefined
      if (attempt.failed || attempt.done) continue
      try {
        const next = attempt.iterator.next()
        if (next.done) attempt.done = true
        else attempt.event = next.value
      } catch {
        attempt.failed = true
      }
    }
    for (let i = 0; i < attempts.length; i++) {
      const a = attempts[i]!
      if (a.failed) continue
      for (let j = i + 1; j < attempts.length; j++) {
        const b = attempts[j]!
        const pair = i * attempts.length + j
        if (b.failed || conflicts.has(pair)) continue
        if (a.done !== b.done || (!a.done && !equalProtocolValues(a.event!, b.event!)))
          conflicts.add(pair)
      }
    }
  }
  const successful = attempts.filter((attempt) => attempt.done && !attempt.failed)
  if (!successful.length)
    throw new UnsupportedReplayProtocolError(
      `No candidate ${kind} protocol decoded the complete stream`,
    )
  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i]!.failed) continue
    for (let j = i + 1; j < attempts.length; j++) {
      if (!attempts[j]!.failed && conflicts.has(i * attempts.length + j))
        throw new UnsupportedReplayProtocolError(
          `Ambiguous candidate ${kind} protocols; decoded events disagree`,
        )
    }
  }
  return successful.map((attempt) => attempt.group)
}
