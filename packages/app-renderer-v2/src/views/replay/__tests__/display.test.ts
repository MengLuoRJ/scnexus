import { expect, test } from 'vitest'
import { replayPlayerName, replayResultClass } from '../display'

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
