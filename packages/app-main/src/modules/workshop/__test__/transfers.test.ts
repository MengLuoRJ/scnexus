import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
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
