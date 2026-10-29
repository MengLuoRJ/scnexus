import { expect, test, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { resolveGithub, githubSource } from '../github'

const signal = () => new AbortController().signal
const source = { kind: 'github' as const, repository: 'https://github.com/a/b', revision: 'main' }
const manifest = { name: 'N', description: '', author: 'A', version: '1.2.3', mods: [] }
test.each(['campaign', 'customize', 'dependency'])('strict preflight supports %s', async (type) => {
  const candidate = {
    ...manifest,
    type,
    ...(type === 'campaign' ? { campaign: 'WOL', bank_enable: 'official' } : {}),
  }
  const fetch = vi.fn<typeof globalThis.fetch>(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).includes('api.github.com') ? { sha: 'a'.repeat(40) } : candidate,
        ),
      ),
  )
  expect((await resolveGithub(source, fetch, signal())).manifest).toEqual(candidate)
})
test.each(['../main', 'a//b', '/main', 'main.lock', 'main?x', 'a\\b'])(
  'rejects unsafe revision %s',
  (revision) => {
    expect(() => githubSource({ ...source, revision })).toThrow('GITHUB_REVISION_INVALID')
  },
)
test('404 and network failures have stable public errors', async () => {
  await expect(
    resolveGithub(source, async () => new Response(null, { status: 404 }), signal()),
  ).rejects.toThrow('GITHUB_REVISION_NOT_FOUND')
  await expect(
    resolveGithub(
      source,
      async () => {
        throw new TypeError('network')
      },
      signal(),
    ),
  ).rejects.toThrow('GITHUB_REQUEST_FAILED')
})
