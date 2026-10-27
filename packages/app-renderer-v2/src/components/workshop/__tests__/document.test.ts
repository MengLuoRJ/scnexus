import { expect, test } from 'vitest'
import { documentFileIds, editorDocument, validateDocument } from '../document'
const id = '11111111-1111-4111-8111-111111111111'
test('only stores fileId references and strips editor-only link defaults', () => {
  const value = editorDocument({
    type: 'doc',
    content: [
      { type: 'image', attrs: { fileId: id, alt: 'test' } },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '<script>not HTML</script>',
            marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank' } }],
          },
        ],
      },
    ],
  })
  expect(documentFileIds(value)).toEqual([id])
  expect(JSON.stringify(value)).not.toContain('_blank')
  expect(validateDocument(value)).toBe(value)
})
test.each([
  {
    type: 'doc',
    content: [{ type: 'image', attrs: { src: 'https://evil.example/pic.png', fileId: id } }],
  },
  { type: 'doc', content: [{ type: 'table' }] },
  {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'link',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      },
    ],
  },
  {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'link',
            marks: [{ type: 'link', attrs: { href: 'https://user:password@example.com' } }],
          },
        ],
      },
    ],
  },
  { type: 'doc', content: [{ type: 'heading', attrs: { level: 99 } }] },
])('rejects unsupported or unsafe rich text %j', (value) => {
  expect(() => validateDocument(value)).toThrow(Error)
})
test('bounds document depth and byte size', () => {
  let value = { type: 'paragraph' } as { type: string; content?: unknown[] }
  for (let i = 0; i < 18; i++) value = { type: 'blockquote', content: [value] }
  expect(() => validateDocument({ type: 'doc', content: [value] })).toThrow(Error)
  expect(() =>
    validateDocument({ type: 'doc', content: [{ type: 'text', text: 'x'.repeat(262145) }] }),
  ).toThrow(Error)
})
