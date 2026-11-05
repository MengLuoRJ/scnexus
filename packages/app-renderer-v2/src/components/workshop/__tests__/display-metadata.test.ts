import { expect, test } from 'vitest'
import { parseDisplayMetadata, validateDisplayChangelog } from '../display-metadata'

test('metadata retains duplicate tags and arbitrary locale versions without coercion', () => {
  const value = {
    tags: ['story', 'story'],
    localization: [{ locale: 'custom-locale', version: 'localized text', translators: ['A', 'B'] }],
  }
  expect(parseDisplayMetadata(value.tags, value.localization)).toEqual(value)
  for (const invalid of [null, 'tag', [1]])
    expect(() => parseDisplayMetadata(invalid, [])).toThrow(
      /tags|localization|metadata|document|changelog/,
    )
  for (const invalid of [
    null,
    [{ locale: 'en', extra: true }],
    [{ locale: 1 }],
    [{ locale: 'en', translators: [1] }],
  ])
    expect(() => parseDisplayMetadata([], invalid)).toThrow(
      /tags|localization|metadata|document|changelog/,
    )
})
test('metadata enforces combined UTF-8 bytes, not characters or arbitrary item limits', () => {
  expect(() => parseDisplayMetadata(['中'.repeat(44000)], [])).toThrow(
    /tags|localization|metadata|document|changelog/,
  )
  expect(parseDisplayMetadata(Array(1001).fill(''), []).tags).toHaveLength(1001)
  const overhead = new TextEncoder().encode(JSON.stringify({ tags: [''], localization: [] })).length
  expect(() => parseDisplayMetadata(['a'.repeat(131072 - overhead)], [])).not.toThrow(
    /tags|localization|metadata|document|changelog/,
  )
  expect(() => parseDisplayMetadata(['a'.repeat(131073 - overhead)], [])).toThrow(
    /tags|localization|metadata|document|changelog/,
  )
})
test('display changelog disallows release-only nodes, links and attributes', () => {
  const doc = (node: unknown) => ({ type: 'doc', content: [node] })
  expect(
    validateDisplayChangelog(
      doc({
        type: 'paragraph',
        content: [{ type: 'text', text: 'note', marks: [{ type: 'bold' }] }],
      }),
    ),
  ).toBeTruthy()
  for (const node of [
    { type: 'horizontalRule' },
    { type: 'image', attrs: { fileId: '11111111-1111-4111-8111-111111111111' } },
    {
      type: 'text',
      text: 'link',
      marks: [{ type: 'link', attrs: { href: 'https://example.test' } }],
    },
    { type: 'heading', attrs: { level: '2' } },
    { type: 'codeBlock', attrs: { language: 'js' } },
    { type: 'text', text: 'bold', marks: [{ type: 'bold', attrs: {} }] },
    { type: 'table' },
  ])
    expect(() => validateDisplayChangelog(doc(node))).toThrow(
      /tags|localization|metadata|document|changelog/,
    )
})
