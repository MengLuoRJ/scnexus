import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink } from 'node:fs/promises'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rm: vi.fn<typeof actual.rm>(actual.rm) }
})
import {
  createWorkshopService,
  trustedOrigin,
  type WorkshopDependencies,
  type WorkshopService,
} from '../service'
import { parseManifest, fingerprint, PART_SIZE } from '../precheck'
import { getFileMd5, getFileMd5Wasm } from '../../../utils/file-md5'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'

const roots: string[] = []
const services: WorkshopService[] = []
afterEach(async () => {
  for (const service of services.splice(0)) await service.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})
const versionId = '11111111-1111-4111-8111-111111111111'
const fileId = '22222222-2222-4222-8222-222222222222'
const sessionId = '33333333-3333-4333-8333-333333333333'
const source = { kind: 'workshop' as const, versionId, projectScnid: 1 }
const bytes = Buffer.from('a verified archive fixture')
const sha256 = createHash('sha256').update(bytes).digest('hex')
const snapshot: AuthSnapshot = {
  status: 'signed-in',
  epoch: 1,
  version: 1,
  accessToken: 'access-secret',
  accessExpiresAt: Date.now() + 100000,
  sessionId,
  userId: '44444444-4444-4444-8444-444444444444',
  sessionExpiresAt: null,
  mfaExpiresAt: null,
}
const authorization = {
  fileId,
  url: `https://packages.example/v1/files/${fileId}`,
  token: 'worker-secret',
  size: bytes.length,
  etag: 'object-etag',
  sha256,
  sha256Source: 'AUTHOR_DECLARED',
  scanStatus: 'NOT_SCANNED',
  chunkSize: PART_SIZE,
}
const json = (body: unknown, status = 201) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function range(body: Uint8Array = bytes, headers: Record<string, string> = {}, status = 206) {
  return new Response(body, {
    status,
    headers: {
      'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
      'content-length': String(bytes.length),
      etag: '"object-etag"',
      ...headers,
    },
  })
}
async function setup(fetch: typeof globalThis.fetch) {
  const root = await mkdtemp(join(process.cwd(), '.workshop-test-'))
  roots.push(root)
  const emit = vi.fn<WorkshopDependencies['emit']>()
  const deps: WorkshopDependencies = {
    apiOrigin: 'https://api.example',
    workshopOrigin: 'https://packages.example',
    filesOrigin: 'https://images.example',
    getSnapshot: () => snapshot,
    getDownloadDirectory: () => join(root, 'cache'),
    refresh: async () => snapshot,
    enabled: () => true,
    emit,
    selectFile: async () => null,
    root,
    fetch,
  }
  const service = await createWorkshopService(deps)
  services.push(service)
  return { root, service, deps, emit }
}
test('fixed worker origins reject credentials, paths, HTTP and arbitrary URL sources', async () => {
  for (const origin of [
    'http://files.example',
    'https://files.example/',
    'https://user:pass@files.example',
    'https://files.example/path',
  ])
    expect(() => trustedOrigin(origin)).toThrow(Error)
  const fetch = vi.fn<typeof globalThis.fetch>()
  const { service } = await setup(fetch)
  await expect(
    service.download({ kind: 'github', repository: 'https://bad', revision: 'main' }),
  ).rejects.toThrow('GITHUB_REPOSITORY_INVALID')
  await expect(
    service.download({ ...source, url: 'https://bad' } as typeof source),
  ).rejects.toThrow('UNSUPPORTED_SOURCE')
  expect(fetch).not.toHaveBeenCalled()
})
test('verified download commits atomically, keeps worker credentials out of persistence and rejects changed cache', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (url: string | URL | Request) =>
    String(url).startsWith('https://api.example') ? json(authorization) : range(),
  )
  const { service, root } = await setup(fetch)
  const task = await service.download(source)
  await service.waitForIdle()
  expect((await service.list())[0]).toMatchObject({
    taskId: task.taskId,
    status: 'completed',
    transferred: bytes.length,
    sha256Source: 'AUTHOR_DECLARED',
  })
  const input = await service.installSource(task.taskId)
  expect(await readFile(input.path)).toEqual(bytes)
  const store = await readFile(join(root, 'tasks.json'), 'utf8')
  expect(store).not.toContain('worker-secret')
  expect(store).not.toContain('access-secret')
  expect(store).not.toContain('https://packages')
  await writeFile(input.path, 'tampered')
  await expect(service.installSource(task.taskId)).rejects.toThrow('CACHE_NOT_VERIFIED')
})
test.each([
  ['200 instead of 206', {}, 200],
  ['wrong range', { 'content-range': 'bytes 0-1/2' }, 206],
  ['wrong ETag', { etag: '"other"' }, 206],
  ['wrong length', { 'content-length': '999' }, 206],
])('rejects %s without publishing a cache source', async (_label, headers, status) => {
  const { service } = await setup(
    vi.fn<typeof globalThis.fetch>(async (url) =>
      String(url).startsWith('https://api.example')
        ? json(authorization)
        : range(bytes, headers as Record<string, string>, status),
    ),
  )
  const task = await service.download(source)
  await service.waitForIdle()
  expect((await service.list())[0].status).toBe('failed')
  await expect(service.installSource(task.taskId)).rejects.toThrow('CACHE_NOT_VERIFIED')
})
test('SHA256 mismatch never exposes cache; malicious worker origins never receive a token', async () => {
  const { service } = await setup(
    vi.fn<typeof globalThis.fetch>(async (url) =>
      String(url).startsWith('https://api.example')
        ? json({ ...authorization, sha256: 'a'.repeat(64) })
        : range(),
    ),
  )
  const task = await service.download(source)
  await service.waitForIdle()
  expect((await service.list())[0]).toMatchObject({ status: 'failed', error: 'SHA256_MISMATCH' })
  await expect(service.installSource(task.taskId)).rejects.toThrow(Error)
  const malicious = vi.fn<typeof globalThis.fetch>(async () =>
    json({ ...authorization, url: `https://evil.example/v1/files/${fileId}` }),
  )
  const other = await setup(malicious)
  await other.service.download(source)
  await other.service.waitForIdle()
  expect(malicious).toHaveBeenCalledTimes(1)
})
test('worker expiry renews authorization once, not user access blindly on 403', async () => {
  let reads = 0
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
    if (String(url).startsWith('https://api.example')) return json(authorization)
    return ++reads === 1 ? new Response(null, { status: 403 }) : range()
  })
  const { service, deps } = await setup(fetch)
  deps.refresh = vi.fn<WorkshopDependencies['refresh']>(async () => snapshot)
  await service.download(source)
  await service.waitForIdle()
  expect((await service.list())[0].status).toBe('completed')
  expect(fetch).toHaveBeenCalledTimes(4)
  expect(deps.refresh).not.toHaveBeenCalled()
})
test('disable aborts active streams, persists paused state and enabling never automatically resumes', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    if (String(url).startsWith('https://api.example')) return json(authorization)
    return new Promise<Response>((_resolve, reject) =>
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
    )
  })
  const { service, root } = await setup(fetch)
  const task = await service.download(source)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  await service.setEnabled(false)
  expect(await service.list()).toEqual([])
  await service.setEnabled(true)
  expect((await service.list())[0].status).toBe('paused')
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(JSON.parse(await readFile(join(root, 'tasks.json'), 'utf8')).tasks[0].status).toBe(
    'paused',
  )
  await expect(service.installSource(task.taskId)).rejects.toThrow(Error)
})
test('complete response loss uses GET/reconcile and never repeats Complete', async () => {
  const root = await mkdtemp(join(process.cwd(), '.workshop-test-'))
  roots.push(root)
  const path = join(root, 'selected.zip')
  await writeFile(path, bytes)
  const hashes = await fingerprint(path)
  const id = randomUUID()
  const record = {
    taskId: id,
    kind: 'upload',
    name: 'selected.zip',
    size: bytes.length,
    transferred: bytes.length,
    status: 'running',
    ownerSession: sessionId,
    epoch: 1,
    path,
    ...hashes,
    versionId,
    sessionId: fileId,
    attempted: [1],
    completing: true,
  }
  await writeFile(join(root, 'tasks.json'), JSON.stringify({ version: 1, tasks: [record] }))
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
    expect(String(url)).not.toContain('/complete')
    return json(
      String(url).endsWith('/reconcile')
        ? { status: 'COMPLETED' }
        : {
            status: 'COMPLETED',
            parts: [{ partNumber: 1, status: 'VERIFIED', size: bytes.length }],
          },
    )
  })
  const deps: WorkshopDependencies = {
    apiOrigin: 'https://api.example',
    workshopOrigin: 'https://packages.example',
    filesOrigin: 'https://images.example',
    getSnapshot: () => snapshot,
    getDownloadDirectory: () => join(root, 'cache'),
    refresh: async () => snapshot,
    enabled: () => true,
    emit: () => {},
    selectFile: async () => null,
    root,
    fetch,
  }
  const service = await createWorkshopService(deps)
  services.push(service)
  expect((await service.list())[0].status).toBe('paused')
  await service.resume(id)
  await service.waitForIdle()
  expect((await service.list())[0].status).toBe('completed')
  expect(fetch).toHaveBeenCalledTimes(3)
})
test('unknown/previously attempted parts must be cancelled, not PUT again', async () => {
  const root = await mkdtemp(join(process.cwd(), '.workshop-test-'))
  roots.push(root)
  const path = join(root, 'selected.zip')
  await writeFile(path, bytes)
  const hashes = await fingerprint(path)
  const id = randomUUID()
  await writeFile(
    join(root, 'tasks.json'),
    JSON.stringify({
      version: 1,
      tasks: [
        {
          taskId: id,
          kind: 'upload',
          name: 'x',
          status: 'paused',
          transferred: 0,
          ownerSession: sessionId,
          epoch: 1,
          path,
          ...hashes,
          versionId,
          sessionId: fileId,
          attempted: [1],
        },
      ],
    }),
  )
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    expect(init?.method).not.toBe('PUT')
    return json({
      status: 'UPLOADING',
      parts: [{ partNumber: 1, status: 'UNKNOWN', size: bytes.length }],
    })
  })
  const service = await createWorkshopService({
    apiOrigin: 'https://api.example',
    workshopOrigin: 'https://packages.example',
    filesOrigin: 'https://images.example',
    getSnapshot: () => snapshot,
    getDownloadDirectory: () => join(root, 'cache'),
    refresh: async () => snapshot,
    enabled: () => true,
    emit: () => {},
    selectFile: async () => null,
    root,
    fetch,
  })
  services.push(service)
  await service.resume(id)
  await service.waitForIdle()
  expect((await service.list())[0]).toMatchObject({
    status: 'unknown',
    error: 'UPLOAD_UNKNOWN_CANCEL_REQUIRED',
  })
  expect(fetch).toHaveBeenCalledTimes(3)
})
test('manifest parser rejects duplicate keys and non-strict versions', () => {
  const manifest = {
    type: 'customize',
    name: 'N',
    description: '',
    author: 'A',
    version: '1.2.3',
    mods: [],
  }
  expect(parseManifest(JSON.stringify(manifest))).toEqual(manifest)
  expect(() =>
    parseManifest(
      JSON.stringify(manifest).replace('"version":"1.2.3"', '"version":"1.2.3","version":"2.0.0"'),
    ),
  ).toThrow('DUPLICATE_MANIFEST_KEY')
  for (const version of ['v1.2.3', '01.2.3', '1.2', ' 1.2.3', '1.2.3-01'])
    expect(() => parseManifest(JSON.stringify({ ...manifest, version }))).toThrow('INVALID_VERSION')
})
test('MD5 native/WASM utility remains standard base64 and fixed 16MiB chunks hash correctly', async () => {
  const root = await mkdtemp(join(process.cwd(), '.workshop-test-'))
  roots.push(root)
  const path = join(root, 'hash.bin')
  const data = Buffer.alloc(PART_SIZE + 3, 7)
  await writeFile(path, data)
  expect(await getFileMd5(path)).toBe(createHash('md5').update(data).digest('base64'))
  expect(await getFileMd5Wasm(path)).toBe(await getFileMd5(path))
  expect((await fingerprint(path)).partMd5).toEqual([
    createHash('md5').update(data.subarray(0, PART_SIZE)).digest('base64'),
    createHash('md5').update(data.subarray(PART_SIZE)).digest('base64'),
  ])
})
test('download timestamps and measured speed are public, completion belongs only to success', async () => {
  const f = await setup(
    vi.fn<typeof fetch>(async (url) =>
      String(url).startsWith('https://api.example') ? json(authorization) : range(),
    ),
  )
  const task = await f.service.download(source)
  expect(task.createdAt).toBe(new Date(task.createdAt!).toISOString())
  expect(task.completedAt).toBeUndefined()
  await f.service.waitForIdle()
  const done = (await f.service.list())[0]
  expect(done.completedAt).toBe(new Date(done.completedAt!).toISOString())
  expect(done.bytesPerSecond).toBe(0)
  expect(f.emit.mock.calls.some(([value]) => (value.bytesPerSecond ?? 0) > 0)).toBe(true)
})
test.each([false, true])(
  'removing completed download deleteFile=%s keeps requested cache policy',
  async (deleteFile) => {
    const f = await setup(
      vi.fn<typeof fetch>(async (url) =>
        String(url).startsWith('https://api.example') ? json(authorization) : range(),
      ),
    )
    const task = await f.service.download(source)
    await f.service.waitForIdle()
    const path = join(f.root, 'cache', task.taskId + '.package')
    expect(await f.service.inspectDownload(task.taskId)).toEqual({ fileExists: true })
    await f.service.removeDownload(task.taskId, deleteFile)
    expect(await f.service.list()).toEqual([])
    const remaining = await readFile(path).catch((error: NodeJS.ErrnoException) => error.code)
    expect(remaining).toEqual(deleteFile ? 'ENOENT' : bytes)
    expect(JSON.parse(await readFile(join(f.root, 'tasks.json'), 'utf8')).tasks).toEqual([])
  },
)
test('missing caches can remove only their records and unsafe cache entries retain records', async () => {
  const f = await setup(vi.fn<typeof fetch>(async () => new Response(null, { status: 403 })))
  const task = await f.service.download(source)
  await f.service.waitForIdle()
  expect((await f.service.list())[0].completedAt).toBeUndefined()
  expect(await f.service.inspectDownload(task.taskId)).toEqual({ fileExists: false })
  const path = join(f.root, 'cache', task.taskId + '.package')
  await mkdir(path)
  await expect(f.service.removeDownload(task.taskId, true)).rejects.toThrow('UNSAFE_CACHE')
  expect(await f.service.list()).toHaveLength(1)
  await rm(path, { recursive: true })
  await f.service.removeDownload(task.taskId, true)
  expect(await f.service.list()).toEqual([])
})
test('file deletion errors retain download history and symlinks never delete their target', async () => {
  const f = await setup(
    vi.fn<typeof fetch>(async (url) =>
      String(url).startsWith('https://api.example') ? json(authorization) : range(),
    ),
  )
  const task = await f.service.download(source)
  await f.service.waitForIdle()
  const path = join(f.root, 'cache', task.taskId + '.package')
  vi.mocked(fs.rm).mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }))
  await expect(f.service.removeDownload(task.taskId, true)).rejects.toThrow('denied')
  expect(await f.service.list()).toHaveLength(1)
  await rm(path)
  const target = join(f.root, 'target')
  await mkdir(target)
  await writeFile(join(target, 'keep'), 'keep')
  await symlink(target, path, 'junction')
  await expect(f.service.removeDownload(task.taskId, true)).rejects.toThrow('UNSAFE_CACHE')
  expect(await readFile(join(target, 'keep'), 'utf8')).toBe('keep')
})
test('same account sees previous sessions and resume obtains fresh authorization; other accounts fail closed', async () => {
  let active = { ...snapshot }
  let attempts = 0
  const headers: unknown[] = []
  const f = await setup(
    vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).startsWith('https://api.example')) {
        headers.push(init?.headers)
        return json(authorization)
      }
      if (++attempts === 1) return new Response(null, { status: 500 })
      return range()
    }),
  )
  f.deps.getSnapshot = () => active
  const task = await f.service.download(source)
  await f.service.waitForIdle()
  active = { ...active, epoch: 2, sessionId: randomUUID(), accessToken: 'new-access' }
  await f.service.authenticationChanged()
  expect(await f.service.list()).toHaveLength(1)
  await f.service.resume(task.taskId)
  await f.service.waitForIdle()
  expect((await f.service.list())[0].status).toBe('completed')
  expect(headers).toMatchObject([
    { Authorization: `Bearer ${snapshot.accessToken}` },
    { Authorization: 'Bearer new-access' },
  ])
  active = { ...active, epoch: 3, userId: randomUUID(), sessionId: randomUUID() }
  await f.service.authenticationChanged()
  expect(await f.service.list()).toEqual([])
  for (const action of [
    () => f.service.resume(task.taskId),
    () => f.service.pause(task.taskId),
    () => f.service.cancel(task.taskId),
    () => f.service.installSource(task.taskId),
    () => f.service.inspectDownload(task.taskId),
    () => f.service.removeDownload(task.taskId, true),
  ])
    await expect(action()).rejects.toThrow('AUTH_SESSION_CHANGED')
})
test('running download refuses removal', async () => {
  const f = await setup(
    vi.fn<typeof fetch>(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) =>
          init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          }),
        ),
    ),
  )
  const task = await f.service.download(source)
  await expect(f.service.removeDownload(task.taskId, true)).rejects.toThrow('TASK_CONFLICT')
  await f.service.pause(task.taskId)
  await f.service.removeDownload(task.taskId, true)
})
test('legacy records without account ownership remain hidden, Github records remain readable without timestamps', async () => {
  const f = await setup(vi.fn<typeof fetch>())
  await f.service.dispose()
  const legacy = {
    taskId: randomUUID(),
    kind: 'download',
    name: 'old',
    status: 'paused',
    size: 0,
    transferred: 0,
    source,
    ownerSession: sessionId,
    epoch: 1,
  }
  const github = {
    ...legacy,
    taskId: randomUUID(),
    source: { kind: 'github', repository: 'https://github.com/Owner/Repo' },
    ownerSession: null,
  }
  await writeFile(
    join(f.root, 'tasks.json'),
    JSON.stringify({ version: 1, tasks: [legacy, github] }),
  )
  const restarted = await createWorkshopService(f.deps)
  services.push(restarted)
  expect(await restarted.list()).toMatchObject([{ taskId: github.taskId, bytesPerSecond: 0 }])
  expect((await restarted.list())[0].createdAt).toBeUndefined()
  await expect(restarted.resume(legacy.taskId)).rejects.toThrow('AUTH_SESSION_CHANGED')
  await expect(restarted.removeDownload(legacy.taskId, false)).rejects.toThrow(
    'AUTH_SESSION_CHANGED',
  )
  f.deps.getSnapshot = vi.fn<() => never>(() => {
    throw new Error('AUTH_NOT_INITIALIZED')
  })
  expect(await restarted.list()).toMatchObject([{ taskId: github.taskId }])
  await restarted.removeDownload(github.taskId, false)
  expect(await restarted.list()).toEqual([])
  const stored = JSON.parse(await readFile(join(f.root, 'tasks.json'), 'utf8')).tasks
  expect(stored).toHaveLength(1)
  expect(stored[0]).toMatchObject(legacy)
})
test('account download history survives service restart while upload and image remain session-scoped', async () => {
  const f = await setup(
    vi.fn<typeof fetch>(async (url) =>
      String(url).startsWith('https://api.example') ? json(authorization) : range(),
    ),
  )
  const task = await f.service.download(source)
  await f.service.waitForIdle()
  await f.service.dispose()
  const store = JSON.parse(await readFile(join(f.root, 'tasks.json'), 'utf8'))
  const upload = { ...store.tasks[0], taskId: randomUUID(), kind: 'upload', source: undefined }
  const image = { ...upload, taskId: randomUUID(), kind: 'image' }
  store.tasks.push(upload, image)
  await writeFile(join(f.root, 'tasks.json'), JSON.stringify(store))
  const active = { ...snapshot, sessionId: randomUUID(), epoch: 2 }
  f.deps.getSnapshot = () => active
  const restarted = await createWorkshopService(f.deps)
  services.push(restarted)
  expect((await restarted.list()).map((item) => item.taskId)).toEqual([task.taskId])
  expect(await restarted.inspectDownload(task.taskId)).toEqual({ fileExists: true })
  await expect(restarted.resume(upload.taskId)).rejects.toThrow('AUTH_SESSION_CHANGED')
  await expect(restarted.inspectDownload(image.taskId)).rejects.toThrow('AUTH_SESSION_CHANGED')
  active.sessionId = sessionId
  active.epoch = snapshot.epoch
  expect(await restarted.list()).toHaveLength(3)
  await expect(restarted.removeDownload(upload.taskId, true)).rejects.toThrow(
    'DOWNLOAD_TASK_REQUIRED',
  )
  await expect(restarted.removeDownload(image.taskId, false)).rejects.toThrow(
    'DOWNLOAD_TASK_REQUIRED',
  )
  await expect(restarted.removeDownload(task.taskId, 'true' as unknown as boolean)).rejects.toThrow(
    Error,
  )
})
test('replaced cache directory junction cannot inspect or delete external files', async () => {
  const f = await setup(vi.fn<typeof fetch>(async () => new Response(null, { status: 403 })))
  const task = await f.service.download(source)
  await f.service.waitForIdle()
  const cache = join(f.root, 'cache')
  await rm(cache, { recursive: true })
  const outside = join(f.root, 'outside')
  await mkdir(outside)
  const target = join(outside, task.taskId + '.package')
  await writeFile(target, bytes)
  await symlink(outside, cache, 'junction')
  await expect(f.service.inspectDownload(task.taskId)).rejects.toThrow('UNSAFE_CACHE')
  await expect(f.service.removeDownload(task.taskId, true)).rejects.toThrow('UNSAFE_CACHE')
  expect(await readFile(target)).toEqual(bytes)
  expect(await f.service.list()).toHaveLength(1)
})

test('download location creates and opens the configured directory without workshop or authentication', async () => {
  const { service, deps, root } = await setup(vi.fn<typeof globalThis.fetch>())
  deps.getDownloadDirectory = () => join(root, 'downloads', 'configured')
  deps.enabled = () => false
  deps.getSnapshot = () => ({
    ...snapshot,
    status: 'signed-out',
    accessToken: null,
    sessionId: null,
    userId: null,
  })
  const openDirectory = vi.fn<(path: string) => Promise<string>>(async () => '')
  deps.openDirectory = openDirectory
  await service.openDownloadLocation()
  expect(openDirectory).toHaveBeenCalledExactlyOnceWith(join(root, 'downloads', 'configured'))
  expect((await fs.lstat(join(root, 'downloads', 'configured'))).isDirectory()).toBe(true)
  openDirectory.mockResolvedValue('Access denied')
  await expect(service.openDownloadLocation()).rejects.toThrow('DOWNLOAD_LOCATION_OPEN_FAILED')
})

test('download location refuses a replaced symbolic-link cache', async () => {
  const { service, deps, root } = await setup(vi.fn<typeof globalThis.fetch>())
  const target = join(root, 'elsewhere')
  await mkdir(target)
  await rm(join(root, 'cache'), { recursive: true })
  await symlink(target, join(root, 'cache'), process.platform === 'win32' ? 'junction' : 'dir')
  const openDirectory = vi.fn<(path: string) => Promise<string>>(async () => '')
  deps.openDirectory = openDirectory
  await expect(service.openDownloadLocation()).rejects.toThrow('UNSAFE_CACHE')
  expect(openDirectory).not.toHaveBeenCalled()
})

test('new downloads use settings directly, persist their directory and retain it across settings changes and restart', async () => {
  const f = await setup(
    vi.fn<typeof fetch>(async (url) =>
      String(url).startsWith('https://api.example') ? json(authorization) : range(),
    ),
  )
  const firstDirectory = join(f.root, 'downloads', 'first')
  const secondDirectory = join(f.root, 'downloads', 'second')
  let directory = firstDirectory
  f.deps.getDownloadDirectory = () => directory
  f.deps.openDirectory = vi.fn<(path: string) => Promise<string>>(async () => '')
  const first = await f.service.download(source)
  await f.service.waitForIdle()
  expect(first).not.toHaveProperty('downloadDirectory')
  expect((await f.service.list())[0]).not.toHaveProperty('downloadDirectory')
  expect(await readFile(join(firstDirectory, first.taskId + '.package'))).toEqual(bytes)
  expect(await fs.readdir(join(f.root, 'cache'))).toEqual([])
  const store = JSON.parse(await readFile(join(f.root, 'tasks.json'), 'utf8'))
  expect(store.tasks[0].downloadDirectory).toBe(firstDirectory)
  directory = secondDirectory
  const second = await f.service.download(source)
  await f.service.waitForIdle()
  expect(await readFile(join(secondDirectory, second.taskId + '.package'))).toEqual(bytes)
  await f.service.dispose()
  const restarted = await createWorkshopService(f.deps)
  services.push(restarted)
  expect((await restarted.installSource(first.taskId)).path).toBe(
    join(firstDirectory, first.taskId + '.package'),
  )
  await restarted.openDownloadLocation(first.taskId)
  expect(f.deps.openDirectory).toHaveBeenLastCalledWith(firstDirectory)
  await restarted.openDownloadLocation()
  expect(f.deps.openDirectory).toHaveBeenLastCalledWith(secondDirectory)
  const unrelated = join(firstDirectory, 'user-document.txt')
  await writeFile(unrelated, 'keep me')
  await writeFile(join(firstDirectory, first.taskId + '.partial'), bytes)
  await restarted.removeDownload(first.taskId, true)
  expect(await fs.readdir(firstDirectory)).toEqual(['user-document.txt'])
  expect(await readFile(unrelated, 'utf8')).toBe('keep me')
  expect(await readFile(join(secondDirectory, second.taskId + '.package'))).toEqual(bytes)
})

test('paused downloads resume in their recorded directory after settings change and restart', async () => {
  let blocked = true
  const f = await setup(
    vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).startsWith('https://api.example')) return json(authorization)
      if (!blocked) return range()
      return new Promise<Response>((_resolve, reject) =>
        init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
      )
    }),
  )
  const directory = join(f.root, 'configured')
  f.deps.getDownloadDirectory = () => directory
  const task = await f.service.download(source)
  await vi.waitFor(() => expect(f.deps.fetch).toHaveBeenCalledTimes(2))
  await f.service.pause(task.taskId)
  expect(await fs.readdir(directory)).toEqual([task.taskId + '.partial'])
  await f.service.dispose()
  f.deps.getDownloadDirectory = () => join(f.root, 'new-setting')
  blocked = false
  const restarted = await createWorkshopService(f.deps)
  services.push(restarted)
  await restarted.resume(task.taskId)
  await restarted.waitForIdle()
  expect((await restarted.installSource(task.taskId)).path).toBe(
    join(directory, task.taskId + '.package'),
  )
  await expect(fs.lstat(join(f.root, 'new-setting'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('legacy tasks without a directory retain the old cache for install, opening and deletion', async () => {
  const f = await setup(
    vi.fn<typeof fetch>(async (url) =>
      String(url).startsWith('https://api.example') ? json(authorization) : range(),
    ),
  )
  const task = await f.service.download(source)
  await f.service.waitForIdle()
  await f.service.dispose()
  const store = JSON.parse(await readFile(join(f.root, 'tasks.json'), 'utf8'))
  delete store.tasks[0].downloadDirectory
  await writeFile(join(f.root, 'tasks.json'), JSON.stringify(store))
  f.deps.getDownloadDirectory = () => join(f.root, 'new-setting')
  f.deps.openDirectory = vi.fn<(path: string) => Promise<string>>(async () => '')
  const restarted = await createWorkshopService(f.deps)
  services.push(restarted)
  expect((await restarted.installSource(task.taskId)).path).toBe(
    join(f.root, 'cache', task.taskId + '.package'),
  )
  await restarted.openDownloadLocation(task.taskId)
  expect(f.deps.openDirectory).toHaveBeenLastCalledWith(join(f.root, 'cache'))
  await restarted.removeDownload(task.taskId, true)
  expect(await fs.readdir(join(f.root, 'cache'))).toEqual([])
})

test('task location enforces task identity and account ownership', async () => {
  const f = await setup(
    vi.fn<typeof fetch>(async (url) =>
      String(url).startsWith('https://api.example') ? json(authorization) : range(),
    ),
  )
  f.deps.openDirectory = vi.fn<(path: string) => Promise<string>>(async () => '')
  const task = await f.service.download(source)
  await f.service.waitForIdle()
  await expect(f.service.openDownloadLocation(f.root)).rejects.toThrow(Error)
  await expect(f.service.openDownloadLocation(randomUUID())).rejects.toThrow('TASK_NOT_FOUND')
  f.deps.getSnapshot = () => ({ ...snapshot, userId: randomUUID() })
  await expect(f.service.openDownloadLocation(task.taskId)).rejects.toThrow('AUTH_SESSION_CHANGED')
  expect(f.deps.openDirectory).not.toHaveBeenCalled()
})

test('configured directory and ancestor symlinks cannot create, open or delete task files', async () => {
  const f = await setup(vi.fn<typeof fetch>(async () => new Response(null, { status: 403 })))
  const directory = join(f.root, 'configured')
  const outside = join(f.root, 'outside')
  f.deps.getDownloadDirectory = () => directory
  f.deps.openDirectory = vi.fn<(path: string) => Promise<string>>(async () => '')
  const task = await f.service.download(source)
  await f.service.waitForIdle()
  await mkdir(outside)
  const external = join(outside, task.taskId + '.partial')
  await writeFile(external, bytes)
  await rm(directory, { recursive: true })
  await symlink(outside, directory, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(f.service.download(source)).rejects.toThrow('UNSAFE_CACHE')
  await expect(f.service.openDownloadLocation()).rejects.toThrow('UNSAFE_CACHE')
  await expect(f.service.openDownloadLocation(task.taskId)).rejects.toThrow('UNSAFE_CACHE')
  await expect(f.service.inspectDownload(task.taskId)).rejects.toThrow('UNSAFE_CACHE')
  await expect(f.service.removeDownload(task.taskId, true)).rejects.toThrow('UNSAFE_CACHE')
  await expect(f.service.cancel(task.taskId)).rejects.toThrow('UNSAFE_CACHE')
  expect(await readFile(external)).toEqual(bytes)
  f.deps.getDownloadDirectory = () => join(directory, 'must-not-create')
  await expect(f.service.openDownloadLocation()).rejects.toThrow('UNSAFE_CACHE')
  expect(await fs.readdir(outside)).toEqual([task.taskId + '.partial'])
  expect(f.deps.openDirectory).not.toHaveBeenCalled()
})

test('relative, empty and non-directory settings are rejected without starting transfers', async () => {
  const f = await setup(vi.fn<typeof fetch>())
  const file = join(f.root, 'not-a-directory')
  await writeFile(file, bytes)
  for (const directory of ['', 'relative-downloads', file]) {
    f.deps.getDownloadDirectory = () => directory
    await expect(f.service.download(source)).rejects.toThrow('UNSAFE_CACHE')
  }
  expect(await f.service.list()).toEqual([])
  expect(f.deps.fetch).not.toHaveBeenCalled()
})

test('legacy paused downloads resume in the old cache despite a new download setting', async () => {
  let blocked = true
  const f = await setup(
    vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).startsWith('https://api.example')) return json(authorization)
      if (!blocked) return range()
      return new Promise<Response>((_resolve, reject) =>
        init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
      )
    }),
  )
  const task = await f.service.download(source)
  await vi.waitFor(() => expect(f.deps.fetch).toHaveBeenCalledTimes(2))
  await f.service.pause(task.taskId)
  await f.service.dispose()
  const store = JSON.parse(await readFile(join(f.root, 'tasks.json'), 'utf8'))
  delete store.tasks[0].downloadDirectory
  await writeFile(join(f.root, 'tasks.json'), JSON.stringify(store))
  f.deps.getDownloadDirectory = () => join(f.root, 'new-setting')
  blocked = false
  const restarted = await createWorkshopService(f.deps)
  services.push(restarted)
  await restarted.resume(task.taskId)
  await restarted.waitForIdle()
  expect((await restarted.installSource(task.taskId)).path).toBe(
    join(f.root, 'cache', task.taskId + '.package'),
  )
  await expect(fs.lstat(join(f.root, 'new-setting'))).rejects.toMatchObject({ code: 'ENOENT' })
})
