import { afterEach, expect, test, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { mkdir, writeFile, readFile, rm, readdir, stat, utimes } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { join } from 'node:path'
import { ContentService } from '../content-package'
import { openSource } from '../source'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import { sevenZip, SevenZipRunner } from '../../../utils/7zip-wrapper'
import { extractExact } from '../../../utils/7zip-wrapper/commands'
import type {
  ContentStore,
  CampaignActiveStoreData,
  InstallProgress,
} from '@scnexus/app-shared/types/content.type'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
function index<T>(data: T) {
  return {
    getSnapshot: () => structuredClone(data),
    update(next: T) {
      data = structuredClone(next)
      return this.getSnapshot()
    },
  }
}
async function fixture(format: 'zip' | '7z', ccm = false, customize = false) {
  const root = join(process.cwd(), '.archive-performance-' + randomUUID())
  roots.push(root)
  const source = join(root, 'source')
  const game = join(root, 'game')
  await mkdir(join(source, 'Wrapper', ccm ? 'Mods' : 'Maps', ccm ? 'Core.SC2Mod' : 'Campaign'), {
    recursive: true,
  })
  await mkdir(game)
  const files: Record<string, string> = ccm
    ? {
        'metadata.txt': 'title=Archive\ndesc=d\nauthor=A\nversion=1\ncampaign=HOTS',
        'Level.SC2Map': 'map',
        'evolution/E.SC2Map': 'evolution',
        'Mods/Core.SC2Mod/@literal.txt': 'at',
        'Mods/Core.SC2Mod/-literal.txt': 'dash',
        'Mods/Core.SC2Mod/中文.txt': 'unicode',
      }
    : {
        'package.json': JSON.stringify({
          name: 'Archive',
          description: 'd',
          author: 'A',
          version: '1',
          type: customize ? 'customize' : 'campaign',
          ...(customize
            ? { maps: [{ name: 'Level.SC2Map', source_path: '/Maps/Campaign/Level.SC2Map' }] }
            : { campaign: 'WOL' }),
        }),
        'Maps/Campaign/Level.SC2Map': 'map'.repeat(100000),
        'unused.bin': 'not selected',
      }
  for (const [name, data] of Object.entries(files)) {
    const path = join(source, 'Wrapper', name)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, data)
  }
  const archive = join(root, 'input.' + format)
  await sevenZip.add(archive, ['Wrapper'], {
    cwd: source,
    archiveType: format,
    ...(format === '7z' ? { solid: true } : {}),
  })
  const paths = gamePaths(game, join(root, 'documents'))
  const initial: ContentStore = {
    _schemaVersion: 2,
    _revision: 0,
    records: [],
    legacyRecords: [],
    scannedAt: null,
  }
  const campaign = index(initial),
    custom = index(initial)
  const service = new ContentService(
    async () => paths,
    campaign,
    custom,
    index<CampaignActiveStoreData>({
      _schemaVersion: 2,
      _revision: 0,
      active: {},
      legacyRecords: [],
      scannedAt: null,
    }),
    async (run) => run(),
  )
  return {
    root,
    game,
    archive,
    paths,
    service,
    campaign,
    custom,
    type: customize ? ('customize' as const) : ('campaign' as const),
  }
}
async function cleanGame(game: string) {
  expect((await readdir(game)).filter((name) => name.startsWith('.scnexus-'))).toEqual([])
}

test.each(['zip', '7z'] as const)(
  '%s preview reads metadata only; install runs exactly one extraction and no stdout resource reads',
  async (format) => {
    const f = await fixture(format)
    const reads = vi.spyOn(sevenZip, 'readFile')
    const extract = vi.spyOn(sevenZip, 'extractExact')
    const spawn = vi.spyOn(SevenZipRunner.prototype, 'spawn')
    const analysis = await f.service.analyze(f.type, { kind: 'archive', path: f.archive })
    expect(reads.mock.calls.map((call) => call[1])).toEqual(['Wrapper/package.json'])
    expect(extract).not.toHaveBeenCalled()
    expect(await readdir(f.game)).toEqual([])
    expect(analysis.modes.scnexus?.files.map((file) => file.target)).toEqual([
      'Maps/Campaign/Level.SC2Map',
    ])
    reads.mockClear()
    spawn.mockClear()
    const events: InstallProgress[] = []
    const record = await f.service.install(
      { analysisId: analysis.analysisId, mode: 'scnexus', decisions: [] },
      f.type,
      (event) => events.push(event),
    )
    expect(extract).toHaveBeenCalledTimes(1)
    expect(spawn.mock.calls).toHaveLength(1)
    expect(spawn.mock.calls[0][0][0]).toBe('x')
    expect(reads).not.toHaveBeenCalled()
    expect(extract.mock.calls[0][1]).not.toContain('Wrapper/unused.bin')
    expect(
      await readFile(join(record.payloadDirectory!, 'Maps', 'Campaign', 'Level.SC2Map'), 'utf8'),
    ).toBe('map'.repeat(100000))
    expect(
      events.some((event) => event.stage === 'extracting' && event.percent === undefined),
    ).toBe(true)
    expect(
      events
        .filter((event) => event.percent !== undefined)
        .every(
          (event) => event.stage === 'extracting' && event.percent! >= 0 && event.percent! <= 100,
        ),
    ).toBe(true)
    expect(events.at(-1)).toMatchObject({ stage: 'completed', completedFiles: 3, totalFiles: 3 })
    await cleanGame(f.game)
  },
)

test.each(['scnexus', 'ccm'] as const)(
  'solid CCM archive preserves %s paths, literal names and original descriptor with one batch',
  async (mode) => {
    const f = await fixture('7z', true)
    const analysis = await f.service.analyze('campaign', { kind: 'archive', path: f.archive })
    const extract = vi.spyOn(sevenZip, 'extractExact')
    const record = await f.service.install({ analysisId: analysis.analysisId, mode, decisions: [] })
    expect(extract).toHaveBeenCalledTimes(1)
    const map = mode === 'ccm' ? 'Level.SC2Map' : 'Maps/Campaign/swarm/Level.SC2Map'
    expect(await readFile(join(record.payloadDirectory!, map), 'utf8')).toBe('map')
    const mod = 'Mods/Core.SC2Mod/@literal.txt'
    expect(await readFile(join(record.payloadDirectory!, mod), 'utf8')).toBe('at')
    expect(await readFile(join(record.managementDirectory, 'metadata.txt'), 'utf8')).toContain(
      'title=Archive',
    )
    const gameMod = mode === 'ccm' ? await readFile(join(f.game, mod), 'utf8') : null
    expect(gameMod).toBe(mode === 'ccm' ? 'at' : null)
    expect(record.files.find((file) => file.type === 'map')?.source).toBe(
      mode === 'ccm' ? 'evolution/E.SC2Map' : 'Maps/Campaign/swarm/evolution/E.SC2Map',
    )
    const manifest =
      mode === 'scnexus'
        ? await readFile(join(record.managementDirectory, 'install-manifest.json'), 'utf8')
        : null
    expect(manifest?.includes('ccm-converted') ?? null).toBe(mode === 'scnexus' ? true : null)
    await cleanGame(f.game)
  },
)

test('same-size same-mtime changed archive rejects before extraction', async () => {
  const f = await fixture('zip')
  const analysis = await f.service.analyze('campaign', { kind: 'archive', path: f.archive })
  const info = await stat(f.archive)
  const data = await readFile(f.archive)
  data[100] ^= 1
  await writeFile(f.archive, data)
  await utimes(f.archive, info.atime, info.mtime)
  const extract = vi.spyOn(sevenZip, 'extractExact')
  await expect(
    f.service.install({ analysisId: analysis.analysisId, mode: 'scnexus', decisions: [] }),
  ).rejects.toMatchObject({ code: 'M051' })
  expect(extract).not.toHaveBeenCalled()
  expect(f.campaign.getSnapshot().records).toEqual([])
  await cleanGame(f.game)
})

test.each(['archive', 'target', 'extra', 'cancel'] as const)(
  'changes during extraction: %s reject with cleanup',
  async (change) => {
    const f = await fixture('zip', false, true)
    const analysis = await f.service.analyze('customize', { kind: 'archive', path: f.archive })
    const realExtract = sevenZip.extractExact.bind(sevenZip)
    vi.spyOn(sevenZip, 'extractExact').mockImplementation(
      async (archive, files, output, options) => {
        const result = await realExtract(archive, files, output, options)
        if (change === 'archive') await writeFile(archive, Buffer.from('changed'))
        if (change === 'target') {
          await mkdir(join(f.game, 'Maps', 'Campaign'), { recursive: true })
          await writeFile(join(f.game, 'Maps', 'Campaign', 'Level.SC2Map'), 'external')
        }
        if (change === 'extra') await writeFile(join(output, 'extra.txt'), 'unexpected')
        if (change === 'cancel') f.service.cancel(analysis.analysisId)
        return result
      },
    )
    await expect(
      f.service.install({ analysisId: analysis.analysisId, mode: 'scnexus', decisions: [] }),
    ).rejects.toBeDefined()
    expect(f.custom.getSnapshot().records).toEqual([])
    const targetContents = await readFile(
      join(f.game, 'Maps', 'Campaign', 'Level.SC2Map'),
      'utf8',
    ).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return null
    })
    expect(targetContents).toBe(change === 'target' ? 'external' : null)
    await cleanGame(f.game)
  },
)

test.each(['cancel', 'store'] as const)(
  'archive direct-write %s failure restores targets and management directory',
  async (failure) => {
    const f = await fixture('zip', false, true)
    await mkdir(join(f.game, 'Maps', 'Campaign'), { recursive: true })
    const target = join(f.game, 'Maps', 'Campaign', 'Level.SC2Map')
    await writeFile(target, 'original')
    const analysis = await f.service.analyze('customize', { kind: 'archive', path: f.archive })
    if (failure === 'store')
      vi.spyOn(f.custom, 'update').mockImplementation(() => {
        throw new Error('store failed')
      })
    await expect(
      f.service.install(
        {
          analysisId: analysis.analysisId,
          mode: 'scnexus',
          decisions: analysis.conflicts[0].files.map((file) => ({
            conflictId: file.conflictId,
            action: 'overwrite',
          })),
        },
        'customize',
        (event) => {
          if (failure === 'cancel' && event.stage === 'copying' && event.completedFiles === 1)
            f.service.cancel(analysis.analysisId)
        },
      ),
    ).rejects.toBeDefined()
    expect(await readFile(target, 'utf8')).toBe('original')
    expect(f.custom.getSnapshot().records).toEqual([])
    await cleanGame(f.game)
    const managed = await readdir(f.paths.customizeDataRoot).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
        return null
      },
    )
    expect(managed).toEqual(failure === 'store' ? [] : null)
  },
)

test('exact extraction uses UTF8 list file for large literal lists, disables wildcards and removes list file', async () => {
  const root = join(process.cwd(), '.archive-list-' + randomUUID())
  roots.push(root)
  const output = join(root, 'out')
  await mkdir(output, { recursive: true })
  const archive = join(root, 'archive.7z')
  await writeFile(archive, '')
  const files = [
    '@literal',
    '-argument',
    'wild*.SC2Mod',
    'question?.SC2Mod',
    '中文.txt',
    ...Array.from({ length: 3000 }, (_, i) => `folder/file-${i}.txt`),
  ]
  const runner = new SevenZipRunner()
  vi.spyOn(runner, 'run').mockImplementation(async (args) => {
    const list = args.find((arg) => arg.startsWith('-i@'))!.slice(3)
    expect(await readFile(list, 'utf8')).toBe(files.join('\n'))
    expect(args).toContain('-spd')
    expect(args).toContain('-scsUTF-8')
    expect(args).toContain('-r-')
    expect(args.at(-2)).toBe('--')
    expect(args.at(-1)).toBe(archive)
    expect(args.length).toBeLessThan(15)
    return { args, command: runner.binaryPath, exitCode: 0, stdout: '', stderr: '' }
  })
  await extractExact(runner, archive, files, output)
  expect((await readdir(root)).filter((name) => name.startsWith('.scnexus-list-'))).toEqual([])
  await expect(extractExact(runner, archive, ['../escape'], output)).rejects.toThrow(
    'Invalid exact',
  )
  await expect(extractExact(runner, archive, ['bad\nname'], output)).rejects.toThrow(
    'Invalid exact',
  )
})

test('7z runner buffers split percentages and UTF8 filenames without inventing progress', async () => {
  const runner = new SevenZipRunner()
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: () => true,
  }) as unknown as ChildProcessWithoutNullStreams
  vi.spyOn(runner, 'spawn').mockReturnValue(child)
  const events: { percent: number; file?: string }[] = []
  const result = runner.run(['x'], { onProgress: (event) => events.push(event) })
  child.stdout.emit('data', Buffer.from(' 1'))
  child.stdout.emit('data', Buffer.from('0% '))
  expect(events).toEqual([])
  const name = Buffer.from('地图')
  child.stdout.emit('data', name.subarray(0, 2))
  child.stdout.emit('data', Buffer.concat([name.subarray(2), Buffer.from('\r')]))
  child.stderr.emit('data', Buffer.from(' 37%\b'))
  child.stdout.emit('data', Buffer.from('100%'))
  child.emit('close', 0)
  await result
  expect(events).toEqual([
    { percent: 10, file: '地图' },
    { percent: 37, file: undefined },
    { percent: 100, file: undefined },
  ])
})

test('real solid 7z large list treats leading @ and dash names literally', async () => {
  const f = await fixture('7z')
  const input = join(f.root, 'literals')
  await mkdir(input)
  const files = [
    '@literal.txt',
    '-switch.txt',
    '中文.txt',
    ...Array.from({ length: 700 }, (_, index) => `file-${index}.txt`),
  ]
  for (const file of files) await writeFile(join(input, file), file)
  const archive = join(f.root, 'literals.7z')
  await sevenZip.add(archive, ['.'], { cwd: input, archiveType: '7z', solid: true })
  const output = join(f.root, 'out')
  await mkdir(output)
  const spawned = vi.spyOn(SevenZipRunner.prototype, 'spawn')
  await sevenZip.extractExact(archive, files, output)
  expect(spawned).toHaveBeenCalledTimes(1)
  expect(await readdir(output)).toHaveLength(files.length)
  expect(await readFile(join(output, '@literal.txt'), 'utf8')).toBe('@literal.txt')
  expect(await readFile(join(output, '-switch.txt'), 'utf8')).toBe('-switch.txt')
  expect(await readFile(join(output, '中文.txt'), 'utf8')).toBe('中文.txt')
  expect((await readdir(f.root)).some((name) => name.startsWith('.scnexus-list-'))).toBe(false)
})

test('real aborted 7z process rejects after closing and removes selection list', async () => {
  const f = await fixture('7z')
  const output = join(f.root, 'aborted')
  await mkdir(output)
  const controller = new AbortController()
  controller.abort()
  await expect(
    sevenZip.extractExact(f.archive, ['Wrapper/package.json'], output, {
      signal: controller.signal,
    }),
  ).rejects.toThrow('7-Zip process failed')
  expect((await readdir(f.root)).some((name) => name.startsWith('.scnexus-list-'))).toBe(false)
})

test('archive change during preview metadata reads rejects the snapshot without extracting', async () => {
  const f = await fixture('zip')
  const realRead = sevenZip.readFile.bind(sevenZip)
  vi.spyOn(sevenZip, 'readFile').mockImplementation(async (archive, file, options) => {
    const result = await realRead(archive, file, options)
    const data = await readFile(archive)
    data[100] ^= 1
    await writeFile(archive, data)
    return result
  })
  const extract = vi.spyOn(sevenZip, 'extractExact')
  await expect(
    f.service.analyze('campaign', { kind: 'archive', path: f.archive }),
  ).rejects.toMatchObject({ code: 'M051' })
  expect(extract).not.toHaveBeenCalled()
  expect(await readdir(f.game)).toEqual([])
})

test('cancellation aborts extraction signal and removes isolated staging', async () => {
  const f = await fixture('7z')
  const analysis = await f.service.analyze('campaign', { kind: 'archive', path: f.archive })
  vi.spyOn(sevenZip, 'extractExact').mockImplementation(
    async (_archive, _files, _output, options) => {
      options!.onProgress!({ percent: 37 })
      expect(options!.signal!.aborted).toBe(true)
      throw new Error('aborted')
    },
  )
  const events: InstallProgress[] = []
  await expect(
    f.service.install(
      { analysisId: analysis.analysisId, mode: 'scnexus', decisions: [] },
      'campaign',
      (event) => {
        events.push(event)
        if (event.percent === 37) f.service.cancel(analysis.analysisId)
      },
    ),
  ).rejects.toMatchObject({ code: 'M049' })
  expect(events.some((event) => event.stage === 'extracting' && event.percent === 37)).toBe(true)
  expect(events.at(-1)).toMatchObject({ stage: 'failed', completedFiles: 0 })
  expect(events.at(-1)?.percent).toBeUndefined()
  await cleanGame(f.game)
})

test('kept customize resources are excluded from exact extraction and writes', async () => {
  const f = await fixture('zip', false, true)
  const target = join(f.game, 'Maps', 'Campaign', 'Level.SC2Map')
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, 'kept')
  const analysis = await f.service.analyze('customize', { kind: 'archive', path: f.archive })
  const extract = vi.spyOn(sevenZip, 'extractExact')
  const record = await f.service.install({
    analysisId: analysis.analysisId,
    mode: 'scnexus',
    decisions: analysis.conflicts[0].files.map((file) => ({
      conflictId: file.conflictId,
      action: 'keep',
    })),
  })
  expect(extract.mock.calls[0][1]).toEqual(['Wrapper/package.json'])
  expect(record.installedFiles[0].result).toBe('kept')
  expect(await readFile(target, 'utf8')).toBe('kept')
  await cleanGame(f.game)
})

test.each(['type', 'revision'] as const)(
  'archive install checks expected %s before extracting',
  async (check) => {
    const f = await fixture('zip')
    const analysis = await f.service.analyze('campaign', { kind: 'archive', path: f.archive })
    const extract = vi.spyOn(sevenZip, 'extractExact')
    if (check === 'revision') f.paths._revision++
    await expect(
      f.service.install(
        { analysisId: analysis.analysisId, mode: 'scnexus', decisions: [] },
        check === 'type' ? 'customize' : 'campaign',
      ),
    ).rejects.toMatchObject({ code: check === 'type' ? 'M037' : 'M051' })
    expect(extract).not.toHaveBeenCalled()
  },
)

test.each(['../escape', '/absolute', 'link'])(
  'unsafe archive entry %s rejected before reading metadata',
  async (name) => {
    const f = await fixture('zip')
    const read = vi.spyOn(sevenZip, 'readFile')
    vi.spyOn(sevenZip, 'list').mockResolvedValue({
      command: '',
      args: [],
      exitCode: 0,
      stdout: '',
      stderr: '',
      entries: [
        {
          path: name,
          size: 1,
          isDirectory: false,
          properties: name === 'link' ? { 'Symbolic Link': 'outside' } : {},
        },
      ],
    })
    await expect(openSource({ kind: 'archive', path: f.archive })).rejects.toMatchObject({
      code: 'M031',
    })
    expect(read).not.toHaveBeenCalled()
  },
)
