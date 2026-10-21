import { expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ window: null as unknown }))
vi.mock('../../modules/window/window', () => ({ getMainWindow: () => mocks.window }))
import { assertIpcSource } from '../ipc-source'
import type { IpcMainInvokeEvent } from 'electron'

test('IPC authentication boundary rejects foreign windows, subframes and remote navigation', () => {
  const mainFrame = { url: 'app://localhost/index.html#/account' }
  const webContents = { mainFrame }
  mocks.window = { isDestroyed: () => false, webContents }
  const event = { sender: webContents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent
  expect(() => assertIpcSource(event)).not.toThrow()
  for (const invalid of [
    { ...event, sender: {} },
    { ...event, senderFrame: { url: 'app://localhost/index.html' } },
  ])
    expect(() => assertIpcSource(invalid as IpcMainInvokeEvent)).toThrow(
      expect.objectContaining({ code: 'M004' }),
    )
  mainFrame.url = 'https://attacker.example/'
  expect(() => assertIpcSource(event)).toThrow(expect.objectContaining({ code: 'M004' }))
})
