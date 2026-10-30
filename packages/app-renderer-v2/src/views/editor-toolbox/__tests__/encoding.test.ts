import { expect, test } from 'vitest'
import { encodeText } from '../encoding'
test.each([
  ['raw', '\\xe6\\xb5\\x8b\\xe8\\xaf\\x95'],
  ['string', '"\\xe6\\xb5\\x8b\\xe8\\xaf\\x95"'],
  ['text', 'StringToText("\\xe6\\xb5\\x8b\\xe8\\xaf\\x95")'],
  ['debug', 'TriggerDebugOutput(1, StringToText("\\xe6\\xb5\\x8b\\xe8\\xaf\\x95"), true);'],
] as const)('converts the supplied example in %s format', (mode, expected) => {
  expect(encodeText('测试', mode)).toBe(expected)
})
test('preserves printable ASCII while escaping quotes, backslashes and control bytes', () => {
  expect(encodeText('A"\\\n\0😀', 'raw')).toBe('A\\"\\\\\\x0a\\x00\\xf0\\x9f\\x98\\x80')
})
test('keeps ASCII suffixes unchanged in mixed text', () => {
  expect(encodeText('测试ABC123+-', 'raw')).toBe('\\xe6\\xb5\\x8b\\xe8\\xaf\\x95ABC123+-')
  expect(encodeText('测试ABC123+-', 'text')).toBe(
    'StringToText("\\xe6\\xb5\\x8b\\xe8\\xaf\\x95ABC123+-")',
  )
})
test('empty input has valid wrappers and does not trim whitespace', () => {
  expect(encodeText('', 'raw')).toBe('')
  expect(encodeText('', 'string')).toBe('""')
  expect(encodeText('', 'text')).toBe('StringToText("")')
  expect(encodeText(' ', 'raw')).toBe(' ')
})
