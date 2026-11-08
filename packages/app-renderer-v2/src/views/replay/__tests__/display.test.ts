import { expect, test } from 'vitest'
import {
  replayPlayerName,
  replayResultClass,
  replayProfilePlayer,
  replayObserverPlayerName,
} from '../display'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'

test('matches profile handle exactly, never nickname, account ID or first participant', () => {
  const players = [
    {
      slot: 1,
      name: 'SameName',
      profileHandle: '1-S2-1-42',
      race: 'Zerg',
      team: 1,
      result: 'loss' as const,
    },
    {
      slot: 2,
      name: 'SameName',
      profileHandle: '5-S2-1-42',
      race: 'Terran',
      team: 2,
      result: 'win' as const,
    },
  ]
  const record = { profileHandle: '5-S2-1-42', players } as ReplayRecord
  expect(replayProfilePlayer(record)?.slot).toBe(2)
  expect(replayProfilePlayer({ ...record, profileHandle: '42' })).toBeNull()
  expect(replayProfilePlayer({ ...record, profileHandle: null })).toBeNull()
  expect(replayProfilePlayer({ ...record, players: [...players, players[1]!] })).toBeNull()
})

test.each([
  ['&lt;ACNet&gt;<sp/>MengLuoRJ', '<ACNet> MengLuoRJ'],
  ['<ACNet><sp />Meng', '<ACNet> Meng'],
  ['&amp;lt;ACNet&amp;gt;', '&lt;ACNet&gt;'],
  ['&#60;ACNet&#x3e;&#32;Meng&#x1F600;', '<ACNet> Meng😀'],
  ['&quot;A&apos;B&amp;C&nbsp;D', '"A\'B&C D'],
  [
    '&unknown; &copy; &#0; &#31; &#127; &#xD800; &#x110000; &#99999999;',
    '&unknown; &copy; &#0; &#31; &#127; &#xD800; &#x110000; &#99999999;',
  ],
  ['<b>Clan</b><img src=x>', '<b>Clan</b><img src=x>'],
  ['&lt;sp/&gt;Meng', ' Meng'],
])('decodes bounded known replay text once: %s', (input, output) => {
  expect(replayPlayerName(input, 'Unknown')).toBe(output)
})

test('preserves missing and empty names and gives each player an independent semantic outcome', () => {
  expect(replayPlayerName(null, 'Unknown')).toBe('Unknown')
  expect(replayPlayerName('', 'Unknown')).toBe('')
  expect(replayResultClass('win')).toBe('text-success')
  expect(replayResultClass('loss')).toBe('text-error')
  expect(replayResultClass('draw')).toBe('text-muted')
  expect(replayResultClass(null)).toBe('text-muted')
})

test('observer names use unique tracker identity, decode as text and disambiguate shared names', () => {
  const players = [
    { playerId: 7, name: 'A &amp; B' },
    { playerId: 2, name: 'A &amp; B' },
  ]
  expect(replayObserverPlayerName(players, 7, 'Player 7')).toBe('A & B (#7)')
  expect(replayObserverPlayerName(players, 2, 'Player 2')).toBe('A & B (#2)')
  expect(replayObserverPlayerName(players, 1, 'Player 1')).toBe('Player 1')
  expect(
    replayObserverPlayerName([...players, { playerId: 7, name: 'Conflict' }], 7, 'Player 7'),
  ).toBe('Player 7')
  expect(replayObserverPlayerName([{ playerId: 7, name: ' ' }], 7, 'Player 7')).toBe('Player 7')
  expect(replayObserverPlayerName([{ playerId: 0, name: 'Unexpected' }], 0, 'Neutral')).toBe(
    'Neutral',
  )
  expect(replayObserverPlayerName(players, null, 'Unknown')).toBe('Unknown')
})
