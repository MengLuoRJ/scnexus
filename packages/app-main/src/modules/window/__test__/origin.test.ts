import { expect, test } from 'vitest'
import { join } from 'node:path'
import { applicationResourcePath, isTrustedRendererUrl } from '../origin'

test('trusts only the exact packaged entry and exact configured development entry', () => {
  expect(isTrustedRendererUrl('app://localhost/index.html#/account')).toBe(true)
  for (const url of [
    'file:///index.html',
    'app://evil/index.html',
    'app://localhost:123/index.html',
    'app://localhost/remote.html',
    'app://user@localhost/index.html',
    'https://localhost/index.html',
  ])
    expect(isTrustedRendererUrl(url)).toBe(false)
  expect(isTrustedRendererUrl('http://localhost:5173/#/account', 'http://localhost:5173/')).toBe(
    true,
  )
  expect(isTrustedRendererUrl('http://127.0.0.1:5173/', 'http://localhost:5173/')).toBe(false)
  expect(isTrustedRendererUrl('http://localhost:5174/', 'http://localhost:5173/')).toBe(false)
})
test('application resources cannot escape their root or access remote origins', () => {
  const root = join(process.cwd(), 'renderer')
  expect(applicationResourcePath(root, 'app://localhost/index.html')).toBe(join(root, 'index.html'))
  expect(applicationResourcePath(root, 'app://localhost/assets/a.js')).toBe(
    join(root, 'assets', 'a.js'),
  )
  for (const url of [
    'https://example.test/a',
    'app://other/a',
    'app://localhost/%2e%2e%2fsecret',
    'app://localhost/%5c..%5csecret',
    'app://localhost/%00',
  ])
    expect(() => applicationResourcePath(root, url)).toThrow(Error)
})
