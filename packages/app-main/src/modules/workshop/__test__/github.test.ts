import { afterEach, expect, test, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createWorkshopService, type WorkshopService, type WorkshopDependencies } from '../service'
import { githubSource, resolveGithub, readGithubBody } from '../github'
import { sevenZip } from '../../../utils/7zip-wrapper'
import type { ContentStore, CampaignActiveStoreData } from '@scnexus/app-shared/types/content.type'
import { ContentService } from '../../content-package/content-package'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import { classifySource } from '../../content-package/classification'
import { openSource } from '../../content-package/source'

const roots: string[] = []
const services: WorkshopService[] = []
afterEach(async () => {
  for (const service of services.splice(0)) await service.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const source = {
  kind: 'github' as const,
  repository: 'https://github.com/Owner/Repo',
  revision: 'feature/foo',
}
const commit = 'a'.repeat(40)
const manifest = {
  type: 'customize',
  name: 'N',
  description: '',
  author: 'A',
  version: '1.2.3',
  mods: [],
}
const json = (value: unknown) => new Response(JSON.stringify(value))
async function setup(transport: typeof fetch) {
  const root = join(process.cwd(), '.github-test-' + randomUUID())
  roots.push(root)
  let enabled = false
  let snapshot = {
    status: 'signed-out',
    epoch: 1,
    version: 1,
    sessionId: null,
    accessToken: null,
    accessExpiresAt: null,
    sessionExpiresAt: null,
    mfaExpiresAt: null,
  } as ReturnType<WorkshopDependencies['getSnapshot']>
  const emit = vi.fn<WorkshopDependencies['emit']>()
  const deps: WorkshopDependencies = {
    apiOrigin: 'https://api.example',
    workshopOrigin: '',
    filesOrigin: '',
    root,
    fetch: transport,
    emit,
    enabled: () => enabled,
    getSnapshot: () => snapshot,
    getDownloadDirectory: () => join(root, 'cache'),
    refresh: vi.fn<WorkshopDependencies['refresh']>(),
    selectFile: async () => null,
  }
  const service = await createWorkshopService(deps)
  services.push(service)
  return {
    root,
    service,
    deps,
    emit,
    setEnabled: (value: boolean) => {
      enabled = value
    },
    changeAccount: () => {
      snapshot = { ...snapshot, epoch: 2, sessionId: randomUUID() }
    },
  }
}
test.each([
  'http://github.com/a/b',
  'https://evil.com/a/b',
  'https://github.com/a/b/tree/main',
  'https://github.com/a/b?x=1',
  'https://user@github.com/a/b',
  'https://github.com/a/..',
  'https://github.com/a/.git',
])('rejects noncanonical repository %s', (repository) => {
  expect(() => githubSource({ ...source, repository })).toThrow('GITHUB_REPOSITORY_INVALID')
})
test('default main and slash branches resolve only to fixed commit URLs without credentials', async () => {
  expect(githubSource({ kind: 'github', repository: source.repository }).revision).toBe('main')
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
    String(url).includes('api.github.com') ? json({ sha: commit }) : json(manifest),
  )
  expect(await resolveGithub(source, fetch, new AbortController().signal)).toMatchObject({
    commit,
    url: `https://codeload.github.com/Owner/Repo/zip/${commit}`,
  })
  expect(String(fetch.mock.calls[0][0])).toContain('feature%2Ffoo')
  expect(String(fetch.mock.calls[1][0])).toBe(
    `https://raw.githubusercontent.com/Owner/Repo/${commit}/package.json`,
  )
  expect(JSON.stringify(fetch.mock.calls)).not.toContain('Authorization')
})
test('invalid manifest fails before task creation and ZIP request', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
    String(url).includes('api.github.com')
      ? json({ sha: commit })
      : json({ ...manifest, version: '1.004', bank_enable: 'offcial' }),
  )
  const f = await setup(fetch)
  await expect(f.service.download(source)).rejects.toThrow('GITHUB_MANIFEST_INVALID')
  expect(await f.service.list()).toEqual([])
  expect(fetch).toHaveBeenCalledTimes(2)
})
test('bounded bodies reject advertised and streaming excess', async () => {
  const signal = new AbortController().signal
  await expect(
    readGithubBody(
      new Response('123', { headers: { 'content-length': '999' } }),
      4,
      signal,
      async () => {},
    ),
  ).rejects.toThrow('GITHUB_SIZE_LIMIT')
  await expect(readGithubBody(new Response('12345'), 4, signal, async () => {})).rejects.toThrow(
    'GITHUB_SIZE_LIMIT',
  )
})
test('anonymous disabled downloads verify wrapped ZIP and cache, survive account changes and restart', async () => {
  let zip = Buffer.from('')
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
    String(url).includes('api.github.com')
      ? json({ sha: commit })
      : String(url).includes('raw.githubusercontent.com')
        ? json(manifest)
        : new Response(zip),
  )
  const f = await setup(fetch)
  const input = join(f.root, 'input')
  await mkdir(join(input, 'Repo-commit'), { recursive: true })
  await writeFile(join(input, 'Repo-commit', 'package.json'), JSON.stringify(manifest))
  const archive = join(f.root, 'fixture.zip')
  await sevenZip.add(archive, ['Repo-commit'], { cwd: input, archiveType: 'zip' })
  zip = await readFile(archive)
  const downloadDirectory = join(f.root, 'configured-downloads')
  f.deps.getDownloadDirectory = () => downloadDirectory
  const task = await f.service.download(source)
  f.changeAccount()
  await f.service.authenticationChanged()
  await f.service.setEnabled(false)
  await f.service.waitForIdle()
  expect((await f.service.list())[0].error).toBeUndefined()
  expect((await f.service.list())[0]).toMatchObject({ status: 'completed', size: zip.length })
  expect((await f.service.list())[0].sha256Source).toBeUndefined()
  expect(f.emit).toHaveBeenCalled()
  const cached = await f.service.installSource(task.taskId)
  expect(cached.path).toBe(join(downloadDirectory, task.taskId + '.package'))
  expect(await readdir(join(f.root, 'cache'))).toEqual([])
  const opened = await openSource(cached)
  expect(opened.entries[0].path).toBe('Repo-commit/package.json')
  expect(await classifySource(opened)).toMatchObject({
    type: 'customize',
    descriptors: { 'package-json': 'Repo-commit/package.json' },
  })
  await f.service.dispose()
  const restarted = await createWorkshopService(f.deps)
  services.push(restarted)
  expect((await restarted.list())[0].status).toBe('completed')
  await restarted.installSource(task.taskId)
  await writeFile(cached.path, 'tampered')
  await expect(restarted.installSource(task.taskId)).rejects.toThrow('CACHE_NOT_VERIFIED')
})
test('pause, account changes, restart and cancellation preserve isolation and remove partial cache', async () => {
  let requested!: () => void
  const started = new Promise<void>((resolve) => {
    requested = resolve
  })
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    if (String(url).includes('api.github.com')) return json({ sha: commit })
    if (String(url).includes('raw.githubusercontent.com')) return json(manifest)
    requested()
    return new Promise<Response>((_resolve, reject) =>
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
    )
  })
  const f = await setup(fetch)
  const task = await f.service.download(source)
  await started
  await f.service.authenticationChanged()
  await f.service.setEnabled(false)
  expect((await f.service.list())[0].status).toBe('running')
  await f.service.pause(task.taskId)
  expect((await f.service.list())[0].status).toBe('paused')
  await f.service.dispose()
  const restarted = await createWorkshopService(f.deps)
  services.push(restarted)
  expect((await restarted.list())[0].status).toBe('paused')
  await restarted.cancel(task.taskId)
  expect((await restarted.list())[0].status).toBe('cancelled')
  expect(await readdir(join(f.root, 'cache'))).toEqual([])
  await expect(restarted.resume(task.taskId)).rejects.toThrow('TASK_CONFLICT')
})

test.each(['invalid-zip', 'oversized'])(
  'failed %s download removes partial data and never exposes cache',
  async (kind) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (String(url).includes('api.github.com')) return json({ sha: commit })
      if (String(url).includes('raw.githubusercontent.com')) return json(manifest)
      return new Response(
        'not a ZIP',
        kind === 'oversized' ? { headers: { 'content-length': '300000001' } } : {},
      )
    })
    const f = await setup(fetch)
    const task = await f.service.download(source)
    await f.service.waitForIdle()
    expect((await f.service.list())[0].status).toBe('failed')
    expect(await readdir(join(f.root, 'cache'))).toEqual([])
    await expect(f.service.installSource(task.taskId)).rejects.toThrow('CACHE_NOT_VERIFIED')
  },
)

test('dependency ZIP downloads, exposes a verified source and enters the existing dependency installer analysis', async () => {
  const dependencyManifest = {
    ...manifest,
    type: 'dependency',
    mods: [{ name: 'Shared.SC2Mod', source_path: '/Mods/Shared.SC2Mod' }],
  }
  let zip = Buffer.from('')
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
    String(url).includes('api.github.com')
      ? json({ sha: commit })
      : String(url).includes('raw.githubusercontent.com')
        ? json(dependencyManifest)
        : new Response(zip),
  )
  const f = await setup(fetch)
  const input = join(f.root, 'input')
  await mkdir(join(input, 'Repo-commit', 'Mods'), { recursive: true })
  await writeFile(join(input, 'Repo-commit', 'package.json'), JSON.stringify(dependencyManifest))
  await writeFile(join(input, 'Repo-commit', 'Mods', 'Shared.SC2Mod'), 'dependency resource')
  const archive = join(f.root, 'dependency.zip')
  await sevenZip.add(archive, ['Repo-commit'], { cwd: input, archiveType: 'zip' })
  zip = await readFile(archive)
  const task = await f.service.download(source)
  await f.service.waitForIdle()
  expect((await f.service.list())[0]).toMatchObject({ status: 'completed', size: zip.length })
  const cached = await f.service.installSource(task.taskId)
  const game = join(f.root, 'isolated-game')
  await mkdir(game)
  const paths = gamePaths(game, join(f.root, 'documents'))
  function index<T>(initial: T) {
    let data = initial
    return {
      getSnapshot: () => structuredClone(data),
      update: (next: T) => {
        data = structuredClone(next)
        return structuredClone(data)
      },
    }
  }
  const initial: ContentStore = {
    _schemaVersion: 2,
    _revision: 0,
    records: [],
    legacyRecords: [],
    scannedAt: null,
  }
  const content = new ContentService(
    async () => paths,
    index(initial),
    index(initial),
    index<CampaignActiveStoreData>({
      _schemaVersion: 2,
      _revision: 0,
      active: {},
      legacyRecords: [],
      scannedAt: null,
    }),
    async (run) => run(),
    index(initial),
  )
  const analysis = await content.analyze('dependency', cached)
  expect(analysis.contentType).toBe('dependency')
  expect(analysis.recommendedMode).toBe('scnexus')
  expect(analysis.modes.scnexus?.package.type).toBe('dependency')
  expect(analysis.modes.scnexus?.rootRelativePath).toBe('Repo-commit')
  expect(analysis.modes.ccm).toBeNull()
  expect((await content.analyzeContent(cached)).contentType).toBe('dependency')
})
test('preview reads only fixed-commit manifest, creates no tasks and confirmation never follows the branch again', async () => {
  let currentCommit = commit
  const transport = vi.fn<typeof fetch>(async (url) =>
    String(url).includes('api.github.com')
      ? json({ sha: currentCommit })
      : String(url).includes('raw.githubusercontent.com')
        ? json(manifest)
        : new Response(null, { status: 404 }),
  )
  const f = await setup(transport)
  const preview = await f.service.previewGithub(source)
  expect(preview.manifest).toEqual(manifest)
  expect(JSON.stringify(preview)).not.toContain('path')
  expect(await f.service.list()).toEqual([])
  expect(transport).toHaveBeenCalledTimes(2)
  expect(JSON.parse(await readFile(join(f.root, 'tasks.json'), 'utf8')).tasks).toEqual([])
  currentCommit = 'b'.repeat(40)
  await f.service.confirmGithub(preview.previewId)
  await f.service.waitForIdle()
  expect(
    transport.mock.calls.filter(([url]) => String(url).includes('api.github.com')),
  ).toHaveLength(1)
  expect(
    transport.mock.calls.some(
      ([url]) => String(url) === `https://codeload.github.com/Owner/Repo/zip/${commit}`,
    ),
  ).toBe(true)
  expect(JSON.stringify(transport.mock.calls)).not.toContain(currentCommit)
  await expect(f.service.confirmGithub(preview.previewId)).rejects.toThrow('GITHUB_PREVIEW_EXPIRED')
})
test('expired Github preview cannot create a download', async () => {
  const f = await setup(
    vi.fn<typeof fetch>(async (url) =>
      String(url).includes('api.github.com') ? json({ sha: commit }) : json(manifest),
    ),
  )
  const preview = await f.service.previewGithub(source)
  const now = Date.now()
  const spy = vi.spyOn(Date, 'now').mockReturnValue(now + 11 * 60 * 1000)
  await expect(f.service.confirmGithub(preview.previewId)).rejects.toThrow('GITHUB_PREVIEW_EXPIRED')
  spy.mockRestore()
  expect(await f.service.list()).toEqual([])
})
