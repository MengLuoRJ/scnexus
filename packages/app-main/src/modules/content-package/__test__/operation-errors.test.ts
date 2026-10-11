import { afterEach, expect, test, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import type { ContentStore, CampaignActiveStoreData } from '@scnexus/app-shared/types/content.type'

const mock = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => Promise<unknown>>(),
  faults: new Map<string, (path: string) => void>(),
  log: vi.fn<() => void>(),
}))
vi.mock('electron', () => ({
  app: { isPackaged: false },
  ipcMain: {
    removeHandler: (channel: string) => mock.handlers.delete(channel),
    handle: (channel: string, handler: (event: unknown) => Promise<unknown>) =>
      mock.handlers.set(channel, handler),
  },
}))
vi.mock('../../../utils/ipc-source', () => ({ assertIpcSource: vi.fn<() => void>() }))
vi.mock('../../logging/logging', () => ({ writeLog: mock.log, reportError: vi.fn<() => void>() }))
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    ...Object.fromEntries(
      ['readFile', 'readdir', 'rm', 'copyFile', 'access'].map((name) => [
        name,
        async (...args: unknown[]) => {
          mock.faults.get(name)?.(String(args[0]))
          return Reflect.apply(
            actual[name as keyof typeof actual] as (...args: unknown[]) => unknown,
            actual,
            args,
          )
        },
      ]),
    ),
  }
})
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises'
import { ContentService } from '../content-package'
import { fileTransaction } from '../transaction'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import { ipcHandle } from '../../../utils/ipc-util'
import {
  sevenZip,
  SevenZipRunner,
  SevenZipError,
  SevenZipTimeoutError,
} from '../../../utils/7zip-wrapper'
import { assertPathExists } from '../../../utils/7zip-wrapper/runner'
import { extractExact, extractToStream } from '../../../utils/7zip-wrapper/commands'

const roots: string[] = []
afterEach(async () => {
  mock.faults.clear()
  mock.log.mockReset()
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
const errno = (code: string) => Object.assign(new Error(`Injected ${code}`), { code, errno: -1 })
function index<T>(data: T) {
  return {
    getSnapshot: () => structuredClone(data),
    update: (next: T) => {
      data = structuredClone(next)
      return data
    },
  }
}
async function fixture() {
  const root = join(process.cwd(), '.operation-errors-' + randomUUID())
  roots.push(root)
  const source = join(root, 'source')
  const game = join(root, 'game')
  await mkdir(join(source, 'Maps'), { recursive: true })
  await mkdir(game)
  await writeFile(
    join(source, 'package.json'),
    JSON.stringify({
      name: 'Test',
      description: 'd',
      version: '1',
      author: 'A',
      type: 'customize',
      maps: [{ name: 'A.SC2Map', source_path: '/Maps/A.SC2Map' }],
    }),
  )
  await writeFile(join(source, 'Maps', 'A.SC2Map'), 'new')
  const paths = gamePaths(game, join(root, 'documents'))
  const initial: ContentStore = {
    _schemaVersion: 2,
    _revision: 0,
    records: [],
    legacyRecords: [],
    scannedAt: null,
  }
  const campaign = index(initial),
    customize = index(initial)
  const service = new ContentService(
    async () => paths,
    campaign,
    customize,
    index<CampaignActiveStoreData>({
      _schemaVersion: 2,
      _revision: 0,
      active: {},
      legacyRecords: [],
      scannedAt: null,
    }),
    async (run) => run(),
  )
  return { root, source, game, paths, service, customize }
}
async function invoke(run: () => unknown) {
  ipcHandle('audit:test', run)
  return (await mock.handlers.get('audit:test')!({})) as {
    ok: boolean
    data: import('@scnexus/app-shared/types/content.type').ContentRecord
    warnings: AppError[]
    error: AppError
  }
}

test.each(['EACCES', 'EPERM', 'ENOENT'])(
  'descriptor read %s propagates through IPC rather than diagnostics',
  async (code) => {
    const f = await fixture()
    mock.faults.set('readFile', (path) => {
      if (path === join(f.source, 'package.json')) throw errno(code)
    })
    const result = await invoke(() =>
      f.service.analyze('customize', { kind: 'directory', path: f.source }),
    )
    expect(result).toMatchObject({
      ok: false,
      error: { code: code === 'ENOENT' ? 'M030' : 'M059' },
    })
  },
)

test('invalid metadata remains an analysis diagnostic', async () => {
  const f = await fixture()
  await writeFile(join(f.source, 'package.json'), '{')
  const result = await invoke(() =>
    f.service.analyze('customize', { kind: 'directory', path: f.source }),
  )
  expect(result).toMatchObject({
    ok: true,
    data: { diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'M034' })]) },
  })
})

test.each(['EBUSY', 'ENOSPC'])(
  'install %s returns classified error and rolls back',
  async (code) => {
    const f = await fixture()
    const analysis = await f.service.analyze('customize', { kind: 'directory', path: f.source })
    mock.faults.set('copyFile', () => {
      throw errno(code)
    })
    const result = await invoke(() =>
      f.service.install({ analysisId: analysis.analysisId, mode: 'scnexus', decisions: [] }),
    )
    expect(result).toMatchObject({ ok: false, error: { code: code === 'EBUSY' ? 'M060' : 'M061' } })
    expect(f.customize.getSnapshot().records).toEqual([])
  },
)

test('backup and staging EPERM after commit preserves persisted success with cleanup warnings', async () => {
  const f = await fixture()
  const analysis = await f.service.analyze('customize', { kind: 'directory', path: f.source })
  mock.faults.set('rm', (path) => {
    if (/\.scnexus-(operation|stage)-/.test(path)) throw errno('EPERM')
  })
  const result = await invoke(() =>
    f.service.install(
      { analysisId: analysis.analysisId, mode: 'scnexus', decisions: [] },
      'customize',
      () => {
        throw Error('sender destroyed')
      },
    ),
  )
  expect(result.ok).toBe(true)
  expect(result.warnings.filter((warning: AppError) => warning.code === 'M062')).toHaveLength(2)
  expect(result.warnings.some((warning: AppError) => warning.code === 'M018')).toBe(true)
  expect(f.customize.getSnapshot().records[0].localId).toBe(result.data.localId)
  expect(await readFile(join(f.paths.mapsRoot, 'A.SC2Map'), 'utf8')).toBe('new')
  expect(await readFile(result.data.descriptorPath, 'utf8')).toContain('Test')
})

test('failed rollback and secondary staging cleanup keep primary M043 and recovery files', async () => {
  const f = await fixture()
  const analysis = await f.service.analyze('customize', { kind: 'directory', path: f.source })
  vi.spyOn(f.customize, 'update').mockImplementation(() => {
    throw new AppError(ERRORS.STORE_WRITE_FAILED)
  })
  mock.faults.set('rm', (path) => {
    if (!path.includes('.scnexus-list-')) throw errno('EPERM')
  })
  const result = await invoke(() =>
    f.service.install({ analysisId: analysis.analysisId, mode: 'scnexus', decisions: [] }),
  )
  expect(result).toMatchObject({ ok: false, error: { code: 'M043' } })
  expect(result).not.toHaveProperty('warnings')
  expect(mock.log).toHaveBeenCalledWith(
    expect.objectContaining({ error: expect.objectContaining({ code: 'M062' }) }),
  )
  expect((await readdir(f.game)).some((path) => path.startsWith('.scnexus-operation-'))).toBe(true)
})

test('cleanup on ordinary failed transaction preserves original error', async () => {
  const f = await fixture()
  const original = new AppError(ERRORS.STORE_WRITE_FAILED)
  mock.faults.set('rm', (path) => {
    if (path.includes('.scnexus-operation-')) throw errno('EPERM')
  })
  const result = await invoke(() =>
    fileTransaction(f.game, async () => {
      throw original
    }),
  )
  expect(result).toMatchObject({ ok: false, error: { errorId: original.errorId, code: 'M006' } })
})

test('archive metadata and list failures retain cause and do not become diagnostics', async () => {
  const f = await fixture()
  const archive = join(f.root, 'input.zip')
  await sevenZip.add(archive, ['.'], { cwd: f.source, archiveType: 'zip' })
  const cause = new SevenZipError('metadata inaccessible')
  vi.spyOn(sevenZip, 'readFile').mockRejectedValue(cause)
  expect(
    await invoke(() => f.service.analyze('customize', { kind: 'archive', path: archive })),
  ).toMatchObject({
    ok: false,
    error: { code: 'M036', message: expect.stringContaining('metadata inaccessible') },
  })
  vi.spyOn(sevenZip, 'list').mockRejectedValue(new SevenZipError('cannot list'))
  expect(
    await invoke(() => f.service.analyze('customize', { kind: 'archive', path: archive })),
  ).toMatchObject({ ok: false, error: { code: 'M032' } })
})

test.each([false, true])(
  '7z exit 1 only reports a successful warning with complete output: missing=%s',
  async (missing) => {
    const f = await fixture()
    const archive = join(f.root, 'input.zip')
    await sevenZip.add(archive, ['.'], { cwd: f.source, archiveType: 'zip' })
    const analysis = await f.service.analyze('customize', { kind: 'archive', path: archive })
    const run = SevenZipRunner.prototype.run
    vi.spyOn(SevenZipRunner.prototype, 'run').mockImplementation(async function (args, options) {
      const result = await run.call(this, args, options)
      if (args[0] === 'x') {
        if (missing)
          await rm(join(args.find((arg) => arg.startsWith('-o'))!.slice(2), 'Maps', 'A.SC2Map'))
        result.exitCode = 1
        options!.onWarning!(result)
      }
      return result
    })
    const result = await invoke(() =>
      f.service.install({ analysisId: analysis.analysisId, mode: 'scnexus', decisions: [] }),
    )
    expect(result).toMatchObject(
      missing ? { ok: false, error: { code: 'M032' } } : { ok: true, warnings: [{ code: 'M063' }] },
    )
    expect(result.warnings?.length ?? 0).toBe(missing ? 0 : 1)
    expect(f.customize.getSnapshot().records).toHaveLength(missing ? 0 : 1)
  },
)

test('selection-list cleanup cannot override successful result or extraction failure', async () => {
  const f = await fixture()
  const archive = join(f.root, 'input.zip')
  await writeFile(archive, '')
  const runner = new SevenZipRunner()
  vi.spyOn(runner, 'run').mockResolvedValue({
    command: '',
    args: [],
    exitCode: 0,
    stdout: '',
    stderr: '',
  })
  mock.faults.set('rm', (path) => {
    if (path.includes('.scnexus-list-')) throw errno('EPERM')
  })
  expect(
    await invoke(() => extractExact(runner, archive, ['a'], join(f.root, 'output'))),
  ).toMatchObject({ ok: true, warnings: [{ code: 'M062' }] })
  vi.mocked(runner.run).mockRejectedValue(new SevenZipError('extract failed'))
  expect(
    await invoke(() => extractExact(runner, archive, ['a'], join(f.root, 'output'))),
  ).toMatchObject({ ok: false, error: { code: 'M036', message: 'extract failed' } })
})

function processFixture() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn<() => boolean>(() => true),
    exitCode: null,
    killed: false,
  }) as unknown as ChildProcessWithoutNullStreams
}
test.each(['stdout', 'stderr', 'process'])(
  '7z %s error deterministically rejects only after close',
  async (where) => {
    const runner = new SevenZipRunner(),
      child = processFixture()
    vi.spyOn(runner, 'spawn').mockReturnValue(child)
    const promise = runner.run(['x'], {
      onProgress: () => {
        throw Error('progress callback')
      },
    })
    expect(() => child.stdout.emit('data', Buffer.from('10%\r'))).not.toThrow()
    if (where === 'process') child.emit('error', Error('child failed'))
    else child[where as 'stdout' | 'stderr'].emit('error', Error('stream failed'))
    child.emit('close', 0)
    await expect(promise).rejects.toBeInstanceOf(SevenZipError)
  },
)

test('stream extraction error waits for close and timeout retains deterministic classification', async () => {
  const runner = new SevenZipRunner(),
    child = processFixture()
  vi.spyOn(runner, 'spawn').mockReturnValue(child)
  const output = extractToStream(runner, 'archive', 'metadata.txt')
  const read = (async () => {
    for await (const chunk of output) void chunk
  })()
  child.stderr.emit('error', Error('stream failed'))
  child.emit('close', 0)
  await expect(read).rejects.toBeInstanceOf(SevenZipError)
  vi.useFakeTimers()
  try {
    const second = processFixture()
    vi.mocked(runner.spawn).mockReturnValue(second)
    const promise = runner.run(['x'], { timeout: 100 })
    vi.advanceTimersByTime(100)
    second.emit('error', Error('termination error'))
    second.emit('close', null)
    await expect(promise).rejects.toBeInstanceOf(SevenZipTimeoutError)
  } finally {
    vi.useRealTimers()
  }
})

test('assertPathExists preserves permission errors instead of disguising as missing paths', async () => {
  const error = errno('EACCES')
  mock.faults.set('access', () => {
    throw error
  })
  await expect(assertPathExists('anywhere')).rejects.toBe(error)
})

test('scanner directory permission failures propagate through IPC', async () => {
  const f = await fixture()
  mock.faults.set('readdir', () => {
    throw errno('EACCES')
  })
  expect(await invoke(() => f.service.scan())).toMatchObject({ ok: false, error: { code: 'M059' } })
})
