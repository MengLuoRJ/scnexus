import { randomUUID, createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, readFile, writeFile, rename, lstat, open, rm, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
import type {
  WorkshopTask,
  WorkshopSource,
  WorkshopUploadInput,
  WorkshopPackageSelection,
} from '@scnexus/app-shared/types/workshop.type'
import type { SourceInput } from '@scnexus/app-shared/types/content.type'
import { githubSource, resolveGithub, readGithubBody } from './github'
import { PART_SIZE, assert, fingerprint, precheckPackage, inspectImage } from './precheck'

export interface WorkshopDependencies {
  apiOrigin: string
  workshopOrigin: string
  filesOrigin: string
  getSnapshot(): AuthSnapshot
  getDownloadDirectory(): string
  refresh(): Promise<AuthSnapshot>
  enabled(): boolean
  onEnabledChanged?(listener: (enabled: boolean) => void): () => void
  emit(task: WorkshopTask): void
  selectFile(kind: 'package' | 'image'): Promise<string | null>
  root?: string
  openDirectory?(path: string): Promise<string>
  fetch?: typeof fetch
}
type StoredTask = WorkshopTask & {
  downloadDirectory?: string
  commit?: string
  manifest?: Record<string, unknown>
  path?: string
  sha256?: string
  partMd5?: string[]
  mtimeMs?: number
  mime?: string
  idempotencyKey?: string
  ownerSession: string | null
  ownerUserId?: string
  epoch: number
  chunks?: number[]
  etag?: string
  attempted?: number[]
  completing?: boolean
  imageAttempted?: boolean
  uploadAttempted?: boolean
}
type Authorization = {
  url: string
  token: string
  fileId: string
  size: number
  etag: string
  sha256: string
  sha256Source: WorkshopTask['sha256Source']
  scanStatus: string
  chunkSize: number
}
type UploadState = {
  status: string
  fileId?: string
  parts?: { partNumber: number; size: number; status: string; etag?: string }[]
}
export function trustedOrigin(value: string) {
  const url = new URL(value)
  assert(
    url.protocol === 'https:' && url.origin === value && !url.username && !url.password,
    'INVALID_TRUSTED_ORIGIN',
  )
  return value
}
function publicTask(task: StoredTask): WorkshopTask {
  const {
    taskId,
    kind,
    status,
    name,
    transferred,
    size,
    source,
    versionId,
    fileId,
    sessionId,
    sha256Source,
    scanStatus,
    error,
    createdAt,
    completedAt,
    bytesPerSecond = 0,
  } = task
  return structuredClone({
    taskId,
    kind,
    status,
    name,
    transferred,
    size,
    source,
    versionId,
    fileId,
    sessionId,
    sha256Source,
    scanStatus,
    error,
    createdAt,
    completedAt,
    bytesPerSecond,
  })
}
function uuid(value: unknown): asserts value is string {
  assert(
    typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  )
}
function etag(value: string) {
  return value.replace(/^"|"$/g, '')
}

export async function createWorkshopService(deps: WorkshopDependencies) {
  const apiUrl = new URL(deps.apiOrigin)
  assert(
    apiUrl.origin === deps.apiOrigin &&
      !apiUrl.username &&
      !apiUrl.password &&
      (apiUrl.protocol === 'https:' ||
        (apiUrl.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(apiUrl.hostname))),
    'INVALID_API_ORIGIN',
  )
  const apiOrigin = deps.apiOrigin
  const workshopOrigin = deps.workshopOrigin ? trustedOrigin(deps.workshopOrigin) : ''
  const filesOrigin = deps.filesOrigin ? trustedOrigin(deps.filesOrigin) : ''
  const transport = deps.fetch ?? globalThis.fetch
  const request: typeof fetch = (url, init) =>
    transport(url, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(120000)])
        : AbortSignal.timeout(120000),
    })
  const root = deps.root ?? join(homedir(), '.scnexus', 'workshop')
  const cache = join(root, 'cache')
  await mkdir(cache, { recursive: true, mode: 0o700 })
  for (const path of [root, cache]) {
    const info = await lstat(path)
    assert(info.isDirectory() && !info.isSymbolicLink(), 'UNSAFE_CACHE')
  }
  const tasks = new Map<string, StoredTask>()
  const cancelling = new Set<string>()
  const removing = new Set<string>()
  const previews = new Map<
    string,
    {
      source: Extract<WorkshopSource, { kind: 'github' }>
      commit: string
      manifest: Record<string, unknown>
      expiresAt: number
    }
  >()
  const progress = new Map<string, { startedAt: number; bytes: number }>()
  const selections = new Map<string, WorkshopPackageSelection & { path: string; mtimeMs: number }>()
  const running = new Map<string, { controller: AbortController; promise: Promise<void> }>()
  let enabled = deps.enabled()
  let saving = Promise.resolve()
  try {
    const stored = JSON.parse(await readFile(join(root, 'tasks.json'), 'utf8'))
    assert(stored.version === 1 && Array.isArray(stored.tasks), 'INVALID_TASK_STORE')
    for (const task of stored.tasks as StoredTask[]) {
      uuid(task.taskId)
      assert(
        ['download', 'upload', 'image'].includes(task.kind) &&
          Number.isSafeInteger(task.size) &&
          task.size >= 0,
        'INVALID_TASK_STORE',
      )
      if (!['completed', 'cancelled'].includes(task.status)) task.status = 'paused'
      task.bytesPerSecond = 0
      if (task.status !== 'completed') delete task.completedAt
      tasks.set(task.taskId, task)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const persist = () => {
    const data = JSON.stringify({ version: 1, tasks: [...tasks.values()] })
    saving = saving
      .catch(() => {})
      .then(async () => {
        const path = join(root, 'tasks.json.new')
        await writeFile(path, data, { mode: 0o600 })
        await rename(path, join(root, 'tasks.json'))
      })
    return saving
  }
  function visible(task: StoredTask) {
    if (task.kind === 'download' && task.source?.kind === 'github') return true
    if (!enabled || !deps.enabled()) return false
    let snapshot: AuthSnapshot
    try {
      snapshot = deps.getSnapshot()
    } catch {
      // Private tasks stay hidden while authentication is unavailable.
      return false
    }
    return (
      !!snapshot.sessionId &&
      !!snapshot.accessToken &&
      (task.kind === 'download'
        ? !!task.ownerUserId && task.ownerUserId === snapshot.userId
        : task.ownerSession === snapshot.sessionId)
    )
  }
  const emit = (task: StoredTask) => {
    if (visible(task)) deps.emit(publicTask(task))
  }
  function reportProgress(task: StoredTask, bytes: number) {
    const sample = progress.get(task.taskId)
    if (sample) {
      sample.bytes += bytes
      task.bytesPerSecond = (sample.bytes * 1000) / Math.max(1, Date.now() - sample.startedAt)
    }
    emit(task)
  }
  const save = async (task: StoredTask) => {
    await persist()
    emit(task)
  }
  function allowed(task?: StoredTask, signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (task?.kind === 'download' && task.source?.kind === 'github') return
    workshopAllowed(task, signal)
  }
  function workshopAllowed(task?: StoredTask, signal?: AbortSignal) {
    signal?.throwIfAborted()
    assert(enabled && deps.enabled(), 'WORKSHOP_DISABLED')
    const snapshot = deps.getSnapshot()
    if (task) {
      assert(visible(task), 'AUTH_SESSION_CHANGED')
      if (signal || task.kind !== 'download')
        assert(
          snapshot.sessionId === task.ownerSession && snapshot.epoch === task.epoch,
          'AUTH_SESSION_CHANGED',
        )
    }
    return snapshot
  }
  async function control<T>(
    path: string,
    method: string,
    body?: unknown,
    task?: StoredTask,
    signal?: AbortSignal,
  ): Promise<T> {
    let snapshot = workshopAllowed(task, signal)
    assert(snapshot.accessToken, 'AUTH_REQUIRED')
    const send = () =>
      request(apiOrigin + path, {
        method,
        redirect: 'error',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${snapshot.accessToken}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    let response = await send()
    if (response.status === 401 && method === 'GET') {
      const previous = snapshot
      snapshot = await deps.refresh()
      assert(
        snapshot.sessionId === previous.sessionId && snapshot.epoch === previous.epoch,
        'AUTH_SESSION_CHANGED',
      )
      allowed(task, signal)
      response = await send()
    }
    if (
      response.status === 409 &&
      method === 'POST' &&
      /^\/workshop\/versions\/[^/]+\/uploads$/.test(path)
    ) {
      await creatorQuota(task, signal)
    }
    assert(response.ok, `CONTROL_HTTP_${response.status}`)
    const result = (await response.json()) as T
    allowed(task, signal)
    return result
  }
  async function creatorQuota(task?: StoredTask, signal?: AbortSignal) {
    const before = workshopAllowed(task, signal)
    const quota = await control<{
      userId: string
      maxProjects: number
      maxPackageBytes: number
      maxStorageBytes: number
      usedStorageBytes: number
    }>('/workshop/creator/quota', 'GET', undefined, task, signal)
    const after = workshopAllowed(task, signal)
    assert(
      before.sessionId === after.sessionId &&
        before.epoch === after.epoch &&
        quota.userId === after.userId,
      'AUTH_SESSION_CHANGED',
    )
    assert(
      Number.isInteger(quota.maxProjects) &&
        quota.maxProjects >= 1 &&
        quota.maxProjects <= 2147483647 &&
        Number.isInteger(quota.maxPackageBytes) &&
        quota.maxPackageBytes >= 0 &&
        quota.maxPackageBytes <= 2147483647 &&
        [quota.maxStorageBytes, quota.usedStorageBytes].every(
          (value) => Number.isSafeInteger(value) && value >= 0,
        ),
      'INVALID_CREATOR_QUOTA',
    )
    return quota
  }
  function workerUrl(url: string, origin: string, route: string) {
    const parsed = new URL(url)
    assert(
      parsed.origin === origin &&
        parsed.protocol === 'https:' &&
        !parsed.username &&
        !parsed.password &&
        !parsed.search &&
        !parsed.hash &&
        parsed.pathname === route,
      'UNTRUSTED_WORKER_URL',
    )
    return parsed.href
  }
  function taskById(id: string) {
    uuid(id)
    const task = tasks.get(id)
    assert(task, 'TASK_NOT_FOUND')
    return task
  }
  async function inspectDirectory(directory: string, create = false): Promise<void> {
    assert(
      typeof directory === 'string' && isAbsolute(directory) && resolve(directory) === directory,
      'UNSAFE_CACHE',
    )
    let info
    try {
      info = await lstat(directory)
    } catch (error) {
      if (!create || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await inspectDirectory(dirname(directory), true)
      await mkdir(directory, { recursive: true, mode: 0o700 })
      info = await lstat(directory)
    }
    assert(
      info.isDirectory() &&
        !info.isSymbolicLink() &&
        relative(directory, await realpath(directory)) === '',
      'UNSAFE_CACHE',
    )
  }
  async function currentDownloadDirectory() {
    const directory = deps.getDownloadDirectory()
    assert(typeof directory === 'string' && isAbsolute(directory), 'UNSAFE_CACHE')
    const normalized = resolve(directory)
    await inspectDirectory(normalized, true)
    return normalized
  }
  function taskDirectory(task: StoredTask) {
    return task.kind === 'download' ? (task.downloadDirectory ?? cache) : cache
  }
  function filePath(task: StoredTask, suffix: string) {
    return join(taskDirectory(task), task.taskId + suffix)
  }
  async function inspectCache(task: StoredTask) {
    const directory = taskDirectory(task)
    await inspectDirectory(resolve(root))
    let existingDirectory = directory
    for (;;) {
      try {
        await inspectDirectory(existingDirectory)
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        const parent = dirname(existingDirectory)
        assert(parent !== existingDirectory, 'UNSAFE_CACHE')
        existingDirectory = parent
      }
    }
    if (existingDirectory !== directory) return []
    const files: string[] = []
    for (const suffix of ['.package', '.partial']) {
      const path = filePath(task, suffix)
      assert(relative(directory, path) === task.taskId + suffix, 'UNSAFE_CACHE')
      try {
        const info = await lstat(path)
        assert(info.isFile() && !info.isSymbolicLink(), 'UNSAFE_CACHE')
        files.push(path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    return files
  }
  async function downloadAuthorization(task: StoredTask, signal: AbortSignal) {
    assert(task.source?.kind === 'workshop')
    const auth = await control<Authorization>(
      `/workshop/versions/${task.source.versionId}/download-authorizations`,
      'POST',
      {},
      task,
      signal,
    )
    uuid(auth.fileId)
    assert(
      Number.isSafeInteger(auth.size) &&
        auth.size > 0 &&
        auth.chunkSize === PART_SIZE &&
        /^[a-f0-9]{64}$/.test(auth.sha256) &&
        typeof auth.etag === 'string' &&
        auth.etag.length > 0 &&
        typeof auth.token === 'string',
      'INVALID_DOWNLOAD_AUTHORIZATION',
    )
    workerUrl(auth.url, workshopOrigin, `/v1/files/${auth.fileId}`)
    if (task.sha256)
      assert(
        task.sha256 === auth.sha256 &&
          task.etag === auth.etag &&
          task.size === auth.size &&
          task.fileId === auth.fileId,
        'DOWNLOAD_OBJECT_CHANGED',
      )
    Object.assign(task, {
      size: auth.size,
      sha256: auth.sha256,
      etag: auth.etag,
      fileId: auth.fileId,
      sha256Source: auth.sha256Source,
      scanStatus: auth.scanStatus,
    })
    return auth
  }
  async function download(task: StoredTask, signal: AbortSignal) {
    await inspectCache(task)
    let auth = await downloadAuthorization(task, signal)
    const partial = filePath(task, '.partial')
    let handle
    try {
      const info = await lstat(partial)
      assert(info.isFile() && !info.isSymbolicLink(), 'UNSAFE_CACHE')
      handle = await open(partial, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      handle = await open(partial, 'wx+', 0o600)
      task.chunks = []
    }
    try {
      const stat = await handle.stat()
      assert(!stat.isSymbolicLink() && stat.isFile(), 'UNSAFE_CACHE')
      const completed = new Set(task.chunks ?? [])
      const partCount = Math.ceil(auth.size / PART_SIZE)
      assert(
        [...completed].every((index) => Number.isInteger(index) && index >= 0 && index < partCount),
        'INVALID_TASK_STORE',
      )
      let nextIndex = 0
      let renewal: Promise<Authorization> | undefined
      const worker = async () => {
        while (nextIndex < partCount) {
          const index = nextIndex++
          if (completed.has(index)) continue
          allowed(task, signal)
          const start = index * PART_SIZE
          const end = Math.min(auth.size - 1, start + PART_SIZE - 1)
          let response: Response | undefined
          for (let attempt = 0; attempt < 2; attempt++) {
            response = await request(auth.url, {
              signal,
              redirect: 'error',
              headers: {
                Authorization: `Bearer ${auth.token}`,
                Range: `bytes=${start}-${end}`,
                'If-Match': `"${etag(auth.etag)}"`,
              },
            })
            if ((response.status === 401 || response.status === 403) && attempt === 0) {
              renewal ??= downloadAuthorization(task, signal).finally(() => {
                renewal = undefined
              })
              auth = await renewal
              continue
            }
            break
          }
          assert(
            response &&
              response.status === 206 &&
              response.headers.get('content-range') === `bytes ${start}-${end}/${auth.size}` &&
              response.headers.get('content-length') === String(end - start + 1) &&
              response.headers.get('etag') === `"${etag(auth.etag)}"` &&
              response.body,
            'INVALID_RANGE_RESPONSE',
          )
          let position = start
          const reader = response.body.getReader()
          try {
            while (true) {
              const { value, done } = await reader.read()
              if (done) break
              allowed(task, signal)
              assert(position + value.length <= end + 1, 'RANGE_SIZE_MISMATCH')
              let written = 0
              while (written < value.length)
                written += (
                  await handle!.write(value, written, value.length - written, position + written)
                ).bytesWritten
              position += value.length
              reportProgress(task, value.length)
            }
          } finally {
            await reader.cancel().catch(() => {})
            reader.releaseLock()
          }
          assert(position === end + 1, 'RANGE_SIZE_MISMATCH')
          allowed(task, signal)
          await handle!.sync()
          completed.add(index)
          task.chunks = [...completed]
          task.transferred = [...completed].reduce(
            (sum, i) => sum + Math.min(PART_SIZE, task.size - i * PART_SIZE),
            0,
          )
          await save(task)
        }
      }
      const results = await Promise.allSettled(
        Array.from({ length: Math.min(4, partCount) }, worker),
      )
      const failed = results.find((result) => result.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
      await handle.truncate(auth.size)
      await handle.sync()
    } finally {
      await handle.close()
    }
    const verified = await fingerprint(partial)
    assert(verified.sha256 === task.sha256 && verified.size === task.size, 'SHA256_MISMATCH')
    allowed(task, signal)
    await rename(partial, filePath(task, '.package'))
    task.status = 'completed'
    task.transferred = task.size
  }
  async function downloadGithub(task: StoredTask, signal: AbortSignal) {
    await inspectCache(task)
    assert(task.source?.kind === 'github' && task.commit && task.manifest, 'INVALID_TASK_STORE')
    const source = githubSource(task.source)
    assert(source.repository === task.source.repository, 'INVALID_TASK_STORE')
    const resolved = await resolveGithub(source, request, signal, task.commit)
    assert(
      JSON.stringify(resolved.manifest) === JSON.stringify(task.manifest),
      'GITHUB_MANIFEST_CHANGED',
    )
    const partial = filePath(task, '.partial')
    try {
      await rm(partial, { force: true })
      task.transferred = 0
      const handle = await open(partial, 'wx', 0o600)
      try {
        const response = await request(resolved.url, {
          signal,
          redirect: 'error',
          headers: { 'Accept-Encoding': 'identity' },
        })
        const length = response.headers.get('content-length')
        task.size = length ? Number(length) : 0
        await readGithubBody(response, null, signal, async (bytes) => {
          let offset = 0
          while (offset < bytes.length)
            offset += (await handle.write(bytes, offset, bytes.length - offset)).bytesWritten
          task.transferred += bytes.length
          reportProgress(task, bytes.length)
        })
        await handle.sync()
      } finally {
        await handle.close()
      }
      const checked = await fingerprint(partial)
      signal.throwIfAborted()
      task.sha256 = checked.sha256
      task.size = checked.size
      await rename(partial, filePath(task, '.package'))
      task.status = 'completed'
      task.transferred = task.size
    } finally {
      await rm(partial, { force: true })
    }
  }
  async function verifyLocal(task: StoredTask) {
    assert(task.path && task.sha256 && task.partMd5, 'LOCAL_FILE_REQUIRED')
    const current = await fingerprint(task.path)
    assert(
      current.sha256 === task.sha256 &&
        current.size === task.size &&
        current.mtimeMs === task.mtimeMs &&
        JSON.stringify(current.partMd5) === JSON.stringify(task.partMd5),
      'LOCAL_FILE_CHANGED',
    )
  }
  async function state(task: StoredTask, signal: AbortSignal, reconcile = false) {
    let result = await control<UploadState>(
      `/workshop/uploads/${task.sessionId}`,
      'GET',
      undefined,
      task,
      signal,
    )
    if (
      reconcile ||
      ['FINALIZING', 'UNCERTAIN'].includes(result.status) ||
      result.parts?.some((part) => ['IN_FLIGHT', 'UNKNOWN'].includes(part.status))
    ) {
      result = await control<UploadState>(
        `/workshop/uploads/${task.sessionId}/reconcile`,
        'POST',
        {},
        task,
        signal,
      )
      // Reconcile may return a summary rather than the DB parts projection.
      result = await control<UploadState>(
        `/workshop/uploads/${task.sessionId}`,
        'GET',
        undefined,
        task,
        signal,
      )
    }
    return result
  }
  function completedUpload(task: StoredTask, snapshot: UploadState) {
    if (snapshot.status !== 'COMPLETED') return false
    task.status = 'completed'
    task.transferred = task.size
    task.fileId = snapshot.fileId
    return true
  }
  async function upload(task: StoredTask, signal: AbortSignal) {
    await verifyLocal(task)
    if (!task.sessionId) {
      if (!task.uploadAttempted) {
        const quota = await creatorQuota(task, signal)
        assert(task.size <= quota.maxPackageBytes, 'PACKAGE_QUOTA_EXCEEDED')
        // Total usage is sum(max(released, candidate or reservation)) per project.
        // Without this project's occupancy, only the server can judge replacement uploads.
        task.uploadAttempted = true
        await save(task)
      }
      const created = await control<{
        sessionId: string
        status: string
        partSize: number
        partCount: number
      }>(
        `/workshop/versions/${task.versionId}/uploads`,
        'POST',
        {
          size: task.size,
          sha256: task.sha256,
          partMd5: task.partMd5,
          idempotencyKey: task.idempotencyKey,
        },
        task,
        signal,
      )
      uuid(created.sessionId)
      assert(
        created.partSize === PART_SIZE && created.partCount === task.partMd5!.length,
        'INVALID_UPLOAD_SESSION',
      )
      task.sessionId = created.sessionId
      await save(task)
    }
    let snapshot = await state(task, signal, task.completing === true)
    if (completedUpload(task, snapshot)) return
    assert(
      snapshot.status === 'UPLOADING' && Array.isArray(snapshot.parts),
      'UPLOAD_REQUIRES_RECONCILIATION',
    )
    if (snapshot.parts.some((part) => ['UNKNOWN', 'IN_FLIGHT'].includes(part.status)))
      throw new Error('UPLOAD_UNKNOWN_CANCEL_REQUIRED')
    const attempted = new Set(task.attempted ?? [])
    for (const part of snapshot.parts) {
      if (part.status === 'VERIFIED') continue
      assert(
        part.status === 'PENDING' && !attempted.has(part.partNumber),
        'UPLOAD_UNKNOWN_CANCEL_REQUIRED',
      )
      const number = part.partNumber
      assert(
        Number.isInteger(number) && number >= 1 && number <= task.partMd5!.length,
        'INVALID_PART',
      )
      const authorization = await control<{
        items: { partNumber: number; url: string; token: string }[]
      }>(
        `/workshop/uploads/${task.sessionId}/part-tokens`,
        'POST',
        { parts: [number] },
        task,
        signal,
      )
      const token = authorization.items.find((item) => item.partNumber === number)
      assert(token && typeof token.token === 'string', 'INVALID_PART_TOKEN')
      workerUrl(token.url, workshopOrigin, `/v1/uploads/${task.sessionId}/parts/${number}`)
      const start = (number - 1) * PART_SIZE
      const length = Math.min(PART_SIZE, task.size - start)
      const file = await open(task.path!, 'r')
      const bytes = Buffer.alloc(length)
      try {
        let read = 0
        while (read < length) {
          const count = (await file.read(bytes, read, length - read, start + read)).bytesRead
          assert(count > 0, 'LOCAL_FILE_CHANGED')
          read += count
        }
      } finally {
        await file.close()
      }
      assert(
        createHash('md5').update(bytes).digest('base64') === task.partMd5![number - 1],
        'LOCAL_FILE_CHANGED',
      )
      attempted.add(number)
      task.attempted = [...attempted]
      await save(task)
      allowed(task, signal)
      try {
        const response = await request(token.url, {
          method: 'PUT',
          redirect: 'error',
          signal,
          headers: {
            Authorization: `Bearer ${token.token}`,
            'Content-MD5': task.partMd5![number - 1],
            'Content-Length': String(length),
            'Content-Type': 'application/octet-stream',
          },
          body: bytes,
        })
        assert(response.ok, 'PART_WRITE_UNCONFIRMED')
      } catch {
        allowed(task, signal)
        snapshot = await state(task, signal, true)
        assert(
          snapshot.parts?.find((item) => item.partNumber === number)?.status === 'VERIFIED',
          'UPLOAD_UNKNOWN_CANCEL_REQUIRED',
        )
      }
      snapshot = await state(task, signal)
      assert(
        snapshot.parts?.find((item) => item.partNumber === number)?.status === 'VERIFIED',
        'UPLOAD_UNKNOWN_CANCEL_REQUIRED',
      )
      task.transferred = snapshot
        .parts!.filter((item) => item.status === 'VERIFIED')
        .reduce((sum, item) => sum + item.size, 0)
      await save(task)
    }
    assert(
      snapshot.parts?.every((part) => part.status === 'VERIFIED'),
      'UPLOAD_INCOMPLETE',
    )
    if (task.completing) throw new Error('COMPLETE_UNKNOWN_RECONCILE_REQUIRED')
    task.completing = true
    await save(task)
    try {
      const result = await control<{ fileId: string }>(
        `/workshop/uploads/${task.sessionId}/complete`,
        'POST',
        {},
        task,
        signal,
      )
      uuid(result.fileId)
      task.fileId = result.fileId
      task.status = 'completed'
      task.transferred = task.size
    } catch {
      allowed(task, signal)
      snapshot = await state(task, signal, true)
      assert(completedUpload(task, snapshot), 'COMPLETE_UNKNOWN_RECONCILE_REQUIRED')
    }
  }
  async function image(task: StoredTask, signal: AbortSignal) {
    await verifyLocal(task)
    if (task.fileId) {
      let snapshot = await control<{ status: string }>(
        `/files/${task.fileId}`,
        'GET',
        undefined,
        task,
        signal,
      )
      if (snapshot.status === 'UPLOADING')
        snapshot = await control(`/files/${task.fileId}/reconcile`, 'POST', {}, task, signal)
      if (snapshot.status === 'READY') {
        task.status = 'completed'
        task.transferred = task.size
        return
      }
      assert(!task.imageAttempted, 'IMAGE_UNKNOWN_CANCEL_REQUIRED')
      // Capabilities never survive a pause/restart. Obtain a fresh object rather than reuse a stale write permission.
      throw new Error('IMAGE_CANCEL_AND_SELECT_AGAIN')
    }
    const authorization = await control<{
      fileId: string
      uploadId: string
      url: string
      token: string
    }>('/files/upload-authorizations', 'POST', { size: task.size, mime: task.mime }, task, signal)
    uuid(authorization.fileId)
    uuid(authorization.uploadId)
    workerUrl(authorization.url, filesOrigin, `/v1/uploads/${authorization.uploadId}`)
    task.fileId = authorization.fileId
    task.imageAttempted = true
    await save(task)
    const bytes = await readFile(task.path!)
    assert(createHash('sha256').update(bytes).digest('hex') === task.sha256, 'LOCAL_FILE_CHANGED')
    try {
      const response = await request(authorization.url, {
        method: 'PUT',
        signal,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${authorization.token}`,
          'Content-Type': task.mime!,
          'Content-Length': String(task.size),
        },
        body: bytes,
      })
      assert(response.ok, 'IMAGE_WRITE_UNCONFIRMED')
    } catch {
      allowed(task, signal)
      const current = await control<{ status: string }>(
        `/files/${task.fileId}`,
        'GET',
        undefined,
        task,
        signal,
      )
      if (current.status !== 'READY') {
        assert(current.status === 'UPLOADING', 'IMAGE_UNKNOWN_CANCEL_REQUIRED')
        const result = await control<{ status: string }>(
          `/files/${task.fileId}/reconcile`,
          'POST',
          {},
          task,
          signal,
        )
        assert(result.status === 'READY', 'IMAGE_UNKNOWN_CANCEL_REQUIRED')
      }
    }
    const current = await control<{ status: string }>(
      `/files/${task.fileId}`,
      'GET',
      undefined,
      task,
      signal,
    )
    assert(current.status === 'READY', 'IMAGE_UNKNOWN_CANCEL_REQUIRED')
    task.status = 'completed'
    task.transferred = task.size
  }
  function launch(task: StoredTask) {
    allowed(task)
    assert(
      !running.has(task.taskId) &&
        !cancelling.has(task.taskId) &&
        !removing.has(task.taskId) &&
        !['completed', 'cancelled'].includes(task.status),
      'TASK_CONFLICT',
    )
    const controller = new AbortController()
    task.status = 'running'
    task.bytesPerSecond = 0
    progress.set(task.taskId, { startedAt: Date.now(), bytes: 0 })
    delete task.completedAt
    delete task.error
    const promise = (async () => {
      try {
        await save(task)
        if (task.source?.kind === 'github') await downloadGithub(task, controller.signal)
        else if (task.kind === 'download') await download(task, controller.signal)
        else if (task.kind === 'upload') await upload(task, controller.signal)
        else await image(task, controller.signal)
      } catch (error) {
        if (controller.signal.aborted) task.status = 'paused'
        else {
          const code = error instanceof Error ? error.message : ''
          task.error = /^[A-Z0-9_]+$/.test(code) ? code : 'TRANSFER_FAILED'
          task.status = /UNKNOWN|RECONCIL/.test(task.error) ? 'unknown' : 'failed'
        }
      } finally {
        if (task.status === 'completed') task.completedAt = new Date().toISOString()
        task.bytesPerSecond = 0
        progress.delete(task.taskId)
        try {
          await save(task)
        } finally {
          running.delete(task.taskId)
        }
      }
    })()
    void promise.catch(() => {})
    running.set(task.taskId, { controller, promise })
    return publicTask(task)
  }
  function make(kind: WorkshopTask['kind'], name: string, size: number): StoredTask {
    const snapshot = workshopAllowed()
    assert(snapshot.sessionId && snapshot.accessToken, 'AUTH_REQUIRED')
    if (kind === 'download') assert(snapshot.userId, 'AUTH_IDENTITY_REQUIRED')
    return {
      taskId: randomUUID(),
      kind,
      name,
      size,
      transferred: 0,
      status: 'paused',
      ownerSession: snapshot.sessionId,
      ...(kind === 'download' ? { ownerUserId: snapshot.userId! } : {}),
      createdAt: new Date().toISOString(),
      bytesPerSecond: 0,
      epoch: snapshot.epoch,
    }
  }
  const service = {
    async openDownloadLocation(taskId?: string) {
      let directory: string
      if (taskId !== undefined) {
        const task = taskById(taskId)
        allowed(task)
        assert(task.kind === 'download', 'DOWNLOAD_TASK_REQUIRED')
        directory = taskDirectory(task)
        await inspectDirectory(directory)
        allowed(task)
      } else directory = await currentDownloadDirectory()
      assert(deps.openDirectory, 'DOWNLOAD_LOCATION_UNAVAILABLE')
      const error = await deps.openDirectory(directory)
      assert(!error, 'DOWNLOAD_LOCATION_OPEN_FAILED')
    },
    async list() {
      return [...tasks.values()].filter(visible).map(publicTask)
    },
    async selectPackage() {
      assert(workshopAllowed().accessToken, 'AUTH_REQUIRED')
      const path = await deps.selectFile('package')
      if (!path) return null
      const snapshot = workshopAllowed()
      const quota = await creatorQuota()
      const checked = await precheckPackage(path, quota.maxPackageBytes, true)
      const current = workshopAllowed()
      assert(
        current.sessionId === snapshot.sessionId && current.epoch === snapshot.epoch,
        'AUTH_SESSION_CHANGED',
      )
      allowed()
      const selection = { selectionId: randomUUID(), name: basename(path), path, ...checked }
      selections.set(selection.selectionId, selection)
      const { path: _path, mtimeMs: _mtime, ...dto } = selection
      return dto
    },
    async previewGithub(source: Extract<WorkshopSource, { kind: 'github' }>) {
      assert(source?.kind === 'github', 'UNSUPPORTED_SOURCE')
      const normalized = githubSource(source)
      const resolved = await resolveGithub(normalized, request, AbortSignal.timeout(120000))
      for (const [id, preview] of previews) if (preview.expiresAt <= Date.now()) previews.delete(id)
      assert(previews.size < 100, 'GITHUB_PREVIEW_LIMIT')
      const previewId = randomUUID()
      previews.set(previewId, {
        source: normalized,
        commit: resolved.commit,
        manifest: resolved.manifest,
        expiresAt: Date.now() + 10 * 60 * 1000,
      })
      return structuredClone({ previewId, source: normalized, manifest: resolved.manifest })
    },
    async confirmGithub(previewId: string) {
      uuid(previewId)
      const preview = previews.get(previewId)
      previews.delete(previewId)
      assert(preview && preview.expiresAt > Date.now(), 'GITHUB_PREVIEW_EXPIRED')
      const task: StoredTask = {
        taskId: randomUUID(),
        kind: 'download',
        name: preview.source.repository.split('/').at(-1)!,
        size: 0,
        transferred: 0,
        status: 'paused',
        source: preview.source,
        commit: preview.commit,
        manifest: preview.manifest,
        downloadDirectory: await currentDownloadDirectory(),
        ownerSession: null,
        epoch: 0,
        createdAt: new Date().toISOString(),
        bytesPerSecond: 0,
      }
      tasks.set(task.taskId, task)
      return launch(task)
    },
    async download(source: WorkshopSource): Promise<WorkshopTask> {
      if (source?.kind === 'github') {
        const preview = await service.previewGithub(source)
        return service.confirmGithub(preview.previewId)
      }
      assert(workshopOrigin, 'WORKSHOP_STORAGE_NOT_CONFIGURED')
      assert(
        source?.kind === 'workshop' &&
          Object.keys(source).every((key) => ['kind', 'versionId', 'projectScnid'].includes(key)),
        'UNSUPPORTED_SOURCE',
      )
      uuid(source.versionId)
      assert(
        Number.isInteger(source.projectScnid) &&
          source.projectScnid > 0 &&
          source.projectScnid <= 2147483647,
      )
      const downloadDirectory = await currentDownloadDirectory()
      const task = make('download', `Workshop ${source.projectScnid}`, 0)
      task.downloadDirectory = downloadDirectory
      task.source = structuredClone(source)
      tasks.set(task.taskId, task)
      return launch(task)
    },
    async upload(input: WorkshopUploadInput) {
      assert(workshopOrigin, 'WORKSHOP_STORAGE_NOT_CONFIGURED')
      uuid(input?.versionId)
      uuid(input?.selectionId)
      const selection = selections.get(input.selectionId)
      assert(selection, 'SELECTION_EXPIRED')
      const task = Object.assign(make('upload', selection.name, selection.size), {
        path: selection.path,
        sha256: selection.sha256,
        partMd5: selection.partMd5,
        mtimeMs: selection.mtimeMs,
        versionId: input.versionId,
        idempotencyKey: randomUUID(),
      })
      tasks.set(task.taskId, task)
      return launch(task)
    },
    async selectImage() {
      assert(filesOrigin, 'WORKSHOP_STORAGE_NOT_CONFIGURED')
      allowed()
      const path = await deps.selectFile('image')
      if (!path) return null
      const inspected = await inspectImage(path)
      const task = Object.assign(make('image', basename(path), inspected.size), inspected, { path })
      tasks.set(task.taskId, task)
      return launch(task)
    },
    async pause(id: string, internal = false) {
      const task = taskById(id)
      if (!internal) {
        allowed(task)
        assert(!removing.has(id), 'TASK_CONFLICT')
      }
      const active = running.get(id)
      active?.controller.abort()
      await active?.promise
      if (!['completed', 'cancelled'].includes(task.status)) {
        task.status = 'paused'
        await save(task)
      }
    },
    async resume(id: string) {
      const task = taskById(id)
      if (task.source?.kind === 'github') return launch(task)
      assert(visible(task), 'AUTH_SESSION_CHANGED')
      const snapshot = workshopAllowed()
      if (task.kind !== 'download')
        assert(snapshot.sessionId === task.ownerSession, 'AUTH_SESSION_CHANGED')
      if (task.kind === 'download') assert(workshopOrigin, 'WORKSHOP_STORAGE_NOT_CONFIGURED')
      task.ownerSession = snapshot.sessionId
      task.epoch = snapshot.epoch
      return launch(task)
    },
    async cancel(id: string) {
      const task = taskById(id)
      allowed(task)
      if (task.status === 'cancelled') return
      assert(task.status !== 'completed', 'COMPLETED_TASK_CANNOT_CANCEL')
      assert(!cancelling.has(id) && !removing.has(id), 'TASK_CONFLICT')
      cancelling.add(id)
      try {
        await service.pause(id)
        if (task.sessionId)
          await control(`/workshop/uploads/${task.sessionId}`, 'DELETE', undefined, task)
        if (task.kind === 'image' && task.fileId)
          await control(`/files/${task.fileId}`, 'DELETE', undefined, task)
        if (task.kind === 'download') {
          await inspectCache(task)
          await rm(filePath(task, '.partial'), { force: true })
          if (task.source?.kind === 'github') await rm(filePath(task, '.package'), { force: true })
        }
        task.status = 'cancelled'
        await save(task)
      } finally {
        cancelling.delete(id)
      }
    },
    async inspectDownload(id: string) {
      const task = taskById(id)
      allowed(task)
      assert(task.kind === 'download', 'DOWNLOAD_TASK_REQUIRED')
      const files = await inspectCache(task)
      allowed(task)
      return { fileExists: files.length > 0 }
    },
    async removeDownload(id: string, deleteFile: boolean) {
      assert(typeof deleteFile === 'boolean')
      const task = taskById(id)
      allowed(task)
      assert(task.kind === 'download', 'DOWNLOAD_TASK_REQUIRED')
      assert(
        task.status !== 'running' && !running.has(id) && !cancelling.has(id) && !removing.has(id),
        'TASK_CONFLICT',
      )
      removing.add(id)
      try {
        const files = await inspectCache(task)
        allowed(task)
        if (deleteFile) for (const path of files) await rm(path, { force: true })
        allowed(task)
        tasks.delete(id)
        try {
          await persist()
        } catch (error) {
          tasks.set(id, task)
          throw error
        }
      } finally {
        removing.delete(id)
      }
    },
    async installSource(id: string): Promise<SourceInput> {
      const task = taskById(id)
      allowed(task)
      assert(
        task.kind === 'download' && task.status === 'completed' && task.sha256,
        'CACHE_NOT_VERIFIED',
      )
      await inspectCache(task)
      const path = filePath(task, '.package')
      const digest = await fingerprint(path)
      assert(digest.sha256 === task.sha256 && digest.size === task.size, 'CACHE_NOT_VERIFIED')
      return { kind: 'archive', path }
    },
    async authenticationChanged() {
      selections.clear()
      await Promise.all(
        [...running.keys()]
          .filter((id) => tasks.get(id)?.source?.kind !== 'github')
          .map((id) => service.pause(id, true)),
      )
    },
    async pauseAll() {
      await Promise.all([...running.keys()].map((id) => service.pause(id, true)))
    },
    async setEnabled(value: boolean) {
      enabled = value
      if (!value)
        await Promise.all(
          [...running.keys()]
            .filter((id) => tasks.get(id)?.source?.kind !== 'github')
            .map((id) => service.pause(id, true)),
        )
    },
    async dispose() {
      stopEnabled?.()
      previews.clear()
      await service.pauseAll()
      await saving
    },
    async waitForIdle() {
      await Promise.all([...running.values()].map((active) => active.promise))
    },
  }
  const stopEnabled = deps.onEnabledChanged?.((value) => {
    void service.setEnabled(value).catch(() => {})
  })
  await persist()
  return service
}
export type WorkshopService = Awaited<ReturnType<typeof createWorkshopService>>
