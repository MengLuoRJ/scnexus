import { describe, expect, it } from 'vitest'
import { agreeingStreamCandidates, equalProtocolValues } from '../src/stream-candidates.js'
import type { ReplayProtocolValue } from '../src/protocol-decoder.js'

function canonical(value: ReplayProtocolValue): string {
  return JSON.stringify(value, (_key, child: unknown) =>
    child && typeof child === 'object' && !Array.isArray(child)
      ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b)))
      : child,
  )
}

describe('incremental candidate evidence', () => {
  it('matches canonical JSON comparison for nested protocol values without reordering output', () => {
    const values: ReplayProtocolValue[] = [
      null,
      false,
      true,
      0,
      -0,
      42,
      '42',
      '18446744073709551615',
      [],
      {},
      { a: null },
      [1, null, { m_x: -1, m_y: 2 }],
      { m_point: { x: 1, y: 2 }, m_mask: [true, false] },
      { m_mask: [true, false], m_point: { y: 2, x: 1 } },
      { m_point: { x: 2, y: 1 }, m_mask: [true, false] },
      { kind: 'blob', hex: 'ff', text: null },
      { text: null, hex: 'ff', kind: 'blob' },
      { kind: 'blob', hex: 'efbc8c', text: '，' },
    ]
    const original = JSON.stringify(values)
    for (const left of values) {
      for (const right of values) {
        expect(equalProtocolValues(left, right)).toBe(canonical(left) === canonical(right))
      }
    }
    expect(JSON.stringify(values)).toBe(original)
  })

  it.each(['game', 'message'] as const)(
    '%s waits for complete consumption despite earlier agreement',
    (kind) => {
      const groups = [0, 1, 2]
      const visited: number[] = []
      const successful = agreeingStreamCandidates(
        groups,
        function* (group) {
          yield { a: 1 }
          yield { a: group === 2 ? 2 : 1 }
          visited.push(group)
          if (group !== 0) throw new Error('Malformed later event')
          return undefined
        },
        kind,
      )
      expect(successful).toEqual([0])
      expect(visited).toEqual(groups)
    },
  )

  it.each(['game', 'message'] as const)(
    '%s rejects complete candidates with different lengths',
    (kind) => {
      expect(() =>
        agreeingStreamCandidates(
          [1, 2],
          function* (length) {
            for (let i = 0; i < length; i++) yield { eventId: 1 }
            return undefined
          },
          kind,
        ),
      ).toThrow(`Ambiguous candidate ${kind} protocols`)
    },
  )

  it('compares every round, including evidence between the first and last retained events', () => {
    expect(() =>
      agreeingStreamCandidates(
        [1, 2],
        function* (id) {
          yield { eventId: 27, data: {} }
          yield { eventId: 40, data: { value: id } }
          yield { eventId: 27, data: {} }
          return undefined
        },
        'game',
      ),
    ).toThrow('Ambiguous candidate game protocols')
  })

  it('discards conflicting evidence only when its candidate eventually fails', () => {
    const result = agreeingStreamCandidates(
      [0, 1, 2],
      function* (id) {
        yield { eventId: id === 1 ? 2 : 1 }
        if (id === 1) throw new Error('Truncated trailing bytes')
        return undefined
      },
      'message',
    )
    expect(result).toEqual([0, 2])
  })

  it('fails without a partial result when all candidates fail after yielding evidence', () => {
    expect(() =>
      agreeingStreamCandidates(
        [0, 1, 2],
        function* () {
          yield { eventId: 1 }
          throw new Error('Event limit exceeded')
        },
        'game',
      ),
    ).toThrow('No candidate game protocol decoded the complete stream')
  })
})
