import { expect, test } from 'vitest'
import { formatFileSize } from '../formatFileSize'

test.each([
  [0, '0 B'],
  [1, '1 B'],
  [999, '999 B'],
  [1000, '1 kB'],
  [1001, '1 kB'],
  [1234, '1.23 kB'],
  [999999, '1000 kB'],
  [1000000, '1 MB'],
  [1250000, '1.25 MB'],
  [1000000000, '1 GB'],
  [1000000000000, '1 TB'],
  [1000000000000000, '1 PB'],
  [1000000000000000000, '1 EB'],
])('formats %i bytes as %s using decimal units', (bytes, formatted) => {
  expect(formatFileSize(bytes)).toBe(formatted)
})
