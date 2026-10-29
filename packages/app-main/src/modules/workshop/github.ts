import { assert, parseManifest, MAX_PACKAGE_SIZE } from './precheck'
import type { WorkshopSource } from '@scnexus/app-shared/types/workshop.type'

export type GithubSource = Extract<WorkshopSource, { kind: 'github' }>
export function githubSource(input: GithubSource): GithubSource {
  assert(
    Object.keys(input).every((key) => ['kind', 'repository', 'revision'].includes(key)),
    'UNSUPPORTED_SOURCE',
  )
  assert(typeof input.repository === 'string', 'GITHUB_REPOSITORY_INVALID')
  const match =
    /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]{1,100})\/?$/.exec(
      input.repository,
    )
  assert(match && !['.', '..', '.git'].includes(match[2]), 'GITHUB_REPOSITORY_INVALID')
  const revision = input.revision ?? 'main'
  assert(
    typeof revision === 'string' &&
      revision.length > 0 &&
      revision.length <= 255 &&
      !revision.startsWith('/') &&
      !revision.endsWith('/') &&
      !revision.includes('..') &&
      !revision.includes('@{') &&
      !/[\s~^:?*[\\]/.test(revision) &&
      ![...revision].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) &&
      revision
        .split('/')
        .every(
          (part) => part && !part.startsWith('.') && !part.endsWith('.') && !part.endsWith('.lock'),
        ),
    'GITHUB_REVISION_INVALID',
  )
  return {
    kind: 'github',
    repository: `https://github.com/${match[1]}/${match[2].replace(/\.git$/, '')}`,
    revision,
  }
}
export async function readGithubBody(
  response: Response,
  limit: number,
  signal: AbortSignal,
  consume: (bytes: Uint8Array) => Promise<void>,
) {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {})
    throw new Error(response.status === 404 ? 'GITHUB_REVISION_NOT_FOUND' : 'GITHUB_REQUEST_FAILED')
  }
  const length = response.headers.get('content-length')
  const reader = response.body.getReader()
  let size = 0
  try {
    assert(
      length === null || (/^\d+$/.test(length) && Number(length) <= limit),
      'GITHUB_SIZE_LIMIT',
    )
    while (true) {
      signal.throwIfAborted()
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      assert(size <= limit, 'GITHUB_SIZE_LIMIT')
      await consume(value)
    }
    signal.throwIfAborted()
    assert(size > 0 && (length === null || size === Number(length)), 'GITHUB_SIZE_MISMATCH')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
export async function resolveGithub(
  source: GithubSource,
  request: typeof fetch,
  signal: AbortSignal,
  commit?: string,
) {
  const slug = source.repository.slice('https://github.com/'.length)
  const text = async (url: string, limit: number) => {
    const chunks: Buffer[] = []
    try {
      await readGithubBody(
        await request(url, {
          signal,
          redirect: 'error',
          headers: { Accept: 'application/vnd.github+json', 'Accept-Encoding': 'identity' },
        }),
        limit,
        signal,
        async (bytes) => {
          chunks.push(Buffer.from(bytes))
        },
      )
    } catch (error) {
      if (error instanceof Error && /^GITHUB_[A-Z_]+$/.test(error.message)) throw error
      throw new Error('GITHUB_REQUEST_FAILED')
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
  }
  if (!commit) {
    const body = await text(
      `https://api.github.com/repos/${slug}/commits/${encodeURIComponent(source.revision ?? 'main')}`,
      1024 * 1024,
    )
    try {
      commit = JSON.parse(body)?.sha
    } catch {
      throw new Error('GITHUB_REQUEST_FAILED')
    }
  }
  assert(typeof commit === 'string' && /^[a-f0-9]{40}$/.test(commit), 'INVALID_GITHUB_COMMIT')
  const manifestText = await text(
    `https://raw.githubusercontent.com/${slug}/${commit}/package.json`,
    128 * 1024,
  )
  let manifest: Record<string, unknown>
  try {
    manifest = parseManifest(manifestText)
  } catch {
    throw new Error('GITHUB_MANIFEST_INVALID')
  }
  return {
    commit,
    manifest,
    url: `https://codeload.github.com/${slug}/zip/${commit}`,
    limit: MAX_PACKAGE_SIZE,
  }
}
