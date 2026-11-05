import { beforeEach, expect, test, vi } from 'vitest'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>(),
  source: vi.fn<(event: unknown) => void>(),
  openExternal: vi.fn<(url: string) => Promise<void>>(),
}))
vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: (channel: string) => mocks.handlers.delete(channel),
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) =>
      mocks.handlers.set(channel, handler),
  },
  shell: { openExternal: mocks.openExternal },
}))
vi.mock('../../../utils/ipc-source', () => ({ assertIpcSource: mocks.source }))
vi.mock('../../logging/logging', () => ({ reportError: vi.fn<() => void>() }))
vi.mock('../../scii-game-setting/scii-game-setting', () => ({ getGamePaths: vi.fn<() => void>() }))
import { initShellIpc } from '../shell.ipc'

beforeEach(() => {
  vi.resetAllMocks()
  initShellIpc()
})
const download = (url: unknown) => mocks.handlers.get('shell:open-external-download')!({}, url)

test.each([
  'https://example.test/file.zip?token=a%20b#download',
  'HTTPS://EXAMPLE.TEST/file.zip',
  'https://example.test/' + 'a'.repeat(2027),
])('opens valid HTTPS download %s', async (url) => {
  expect(await download(url)).toEqual({ ok: true, data: undefined })
  expect(mocks.openExternal).toHaveBeenCalledExactlyOnceWith(new URL(url).href)
})

test.each([
  undefined,
  null,
  42,
  {},
  '',
  'http://example.test/file.zip',
  'file:///D:/file.zip',
  'javascript:alert(1)',
  '//example.test/file.zip',
  'https:example.test/file.zip',
  'https:/example.test/file.zip',
  'https:///example.test/file.zip',
  'https://',
  'https://?example.test',
  'https://example.test:invalid/file.zip',
  'https://user:pass@example.test/file.zip',
  'https://user@example.test/file.zip',
  'https://:pass@example.test/file.zip',
  'https://@example.test/file.zip',
  'https://example.test/' + 'a'.repeat(2028),
  ...[' ', '\t', '\n', '\r', '\u0000', '\u001f', '\u007f', '\u0085', '\u00a0', '\\'].map(
    (character) => `https://example.test/a${character}b.zip`,
  ),
  ' https://example.test/file.zip',
  'https://example.test/file.zip ',
])('rejects invalid download URL %j without opening the shell', async (url) => {
  expect(await download(url)).toMatchObject({
    ok: false,
    error: { code: ERRORS.IPC_INVALID_ARGUMENT.code },
  })
  expect(mocks.openExternal).not.toHaveBeenCalled()
})

test('uses the sender guard before opening a download', async () => {
  const event = { sender: 'untrusted' }
  mocks.source.mockImplementationOnce(() => {
    throw new AppError(ERRORS.IPC_SOURCE_REJECTED)
  })
  expect(
    await mocks.handlers.get('shell:open-external-download')!(event, 'https://example.test'),
  ).toMatchObject({
    ok: false,
    error: { code: ERRORS.IPC_SOURCE_REJECTED.code },
  })
  expect(mocks.source).toHaveBeenCalledExactlyOnceWith(event)
  expect(mocks.openExternal).not.toHaveBeenCalled()
})

test('returns shell failures through the uniform error envelope', async () => {
  mocks.openExternal.mockRejectedValueOnce(new Error('OS failure'))
  expect(await download('https://example.test')).toMatchObject({
    ok: false,
    error: { errorId: expect.any(String) },
  })
})

test('keeps HTTP website links allowed independently of downloads', async () => {
  expect(
    await mocks.handlers.get('shell:open-external-website')!({}, 'http://example.test/file.zip'),
  ).toEqual({ ok: true, data: undefined })
  expect(mocks.openExternal).toHaveBeenCalledExactlyOnceWith('http://example.test/file.zip')
})
