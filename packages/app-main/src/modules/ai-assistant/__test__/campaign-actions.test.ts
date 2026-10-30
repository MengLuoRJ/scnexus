import { beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  list: vi.fn<() => { records: (typeof record)[] }>(),
  active: vi.fn<() => { active: { WOL: typeof active } }>(),
  prepareActivation:
    vi.fn<
      () => Promise<{
        activationId?: string
        localId: string
        conflicts: unknown[]
        files?: unknown[]
      }>
    >(),
  activate: vi.fn<() => Promise<unknown> | unknown>(),
  prepareDeactivation:
    vi.fn<
      () => Promise<{ removalId: string; localId: string; operation: string; files: unknown[] }>
    >(),
  deactivate: vi.fn<() => Promise<void>>(),
  prepareUninstall:
    vi.fn<
      () => Promise<{ removalId: string; localId: string; operation: string; files: unknown[] }>
    >(),
  uninstall: vi.fn<() => Promise<void>>(),
  window: vi.fn<() => typeof window>(),
  dialog: vi.fn<(window: unknown, options: { detail: string }) => Promise<{ response: number }>>(),
  game: vi.fn<() => Promise<{ paths: { gameRoot: string } }>>(),
  walk: vi.fn<
    (
      root: string,
      visit: (absolute: string, path: string, info: { isFile: () => boolean }) => Promise<void>,
    ) => Promise<void>
  >(),
  hash: vi.fn<() => Promise<string>>(),
  resource: vi.fn<() => Promise<{ hash: string }>>(),
}))
vi.mock('electron', () => ({ dialog: { showMessageBox: mocks.dialog } }))
vi.mock('../../campaign', () => ({
  list: mocks.list,
  getActive: mocks.active,
  prepareActivation: mocks.prepareActivation,
  activate: mocks.activate,
  prepareDeactivation: mocks.prepareDeactivation,
  deactivate: mocks.deactivate,
  prepareUninstall: mocks.prepareUninstall,
  uninstall: mocks.uninstall,
}))
vi.mock('../../window/window', () => ({ getMainWindow: mocks.window }))
vi.mock('../../scii-game-setting', () => ({ getGameSnapshot: mocks.game }))
vi.mock('../../content-package/paths', () => ({
  keyPath: (value: string) => value.toLowerCase(),
  safeGamePath: async (_paths: unknown, target: string) => target,
  walkReadOnly: mocks.walk,
}))
vi.mock('../../content-package/resources', async (original) => ({
  ...(await original<typeof import('../../content-package/resources')>()),
  resourceState: mocks.resource,
}))
vi.mock('../../content-package/source', () => ({ hashFile: mocks.hash }))
import {
  activateCampaign,
  switchCampaign,
  restoreCampaign,
  uninstallCampaign,
} from '../campaign-actions'
const file = { target: 'Mods/test.SC2Mod', type: 'mod', result: 'copied', hash: 'original' }
let record: {
  localId: string
  external: boolean
  managementDirectory: string
  fileCount: number
  mode: string
  descriptorPath: string
  package: { name: string; type: string; campaign: string }
  installedFiles: (typeof file)[]
  changed?: boolean
}
let active:
  | {
      localId: string
      descriptorPath?: string
      installedFiles?: (typeof file)[]
      ownershipUnknown?: boolean
    }
  | undefined
let window: {
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  isDestroyed: () => boolean
  webContents: {
    on: ReturnType<typeof vi.fn>
    off: ReturnType<typeof vi.fn>
    isDestroyed: () => boolean
    getURL: () => string
  }
} | null
beforeEach(() => {
  vi.resetAllMocks()
  record = {
    localId: 'known',
    external: true,
    managementDirectory: 'D:\\game\\library',
    fileCount: 1,
    mode: 'scnexus',
    descriptorPath: 'PRIVATE_DESCRIPTOR',
    package: { name: 'Test\nCampaign', type: 'campaign', campaign: 'WOL' },
    installedFiles: [file],
  }
  active = undefined
  window = {
    on: vi.fn<() => void>(),
    off: vi.fn<() => void>(),
    isDestroyed: () => false,
    webContents: {
      on: vi.fn<() => void>(),
      off: vi.fn<() => void>(),
      isDestroyed: () => false,
      getURL: () => 'app://localhost/index.html',
    },
  }
  mocks.window.mockImplementation(() => window)
  mocks.list.mockImplementation(() => ({ records: [record] }))
  mocks.active.mockImplementation(() => ({ active: { WOL: active } }))
  mocks.prepareActivation.mockResolvedValue({
    activationId: 'activation-preview',
    localId: 'known',
    conflicts: [],
    files: [file],
  })
  mocks.prepareDeactivation.mockResolvedValue({
    removalId: 'restore-preview',
    localId: 'known',
    operation: 'deactivate',
    files: [],
  })
  mocks.prepareUninstall.mockResolvedValue({
    removalId: 'uninstall-preview',
    localId: 'known',
    operation: 'uninstall',
    files: [],
  })
  mocks.game.mockResolvedValue({ paths: { gameRoot: 'D:\\game' } })
  mocks.resource.mockResolvedValue({ hash: 'inventory' })
  mocks.hash.mockResolvedValue('original')
  mocks.walk.mockImplementation(async (_root, visit) => {
    await visit('PRIVATE_FILE', '', { isFile: () => true })
  })
  mocks.dialog.mockResolvedValue({ response: 1 })
})
const signal = () => new AbortController().signal
function setActive() {
  active = { localId: 'known', descriptorPath: 'PRIVATE_ACTIVE', installedFiles: [file] }
}
test('conflict-free activation uses only known ID and service preview with mutation boundary', async () => {
  const begin = vi.fn<() => void>()
  mocks.activate.mockImplementation(() => {
    expect(begin).toHaveBeenCalledOnce()
    return { privatePath: 'PRIVATE_FILE' }
  })
  expect(await activateCampaign('known', signal(), begin)).toEqual({
    id: 'known',
    operation: 'activate',
    status: 'completed',
  })
  expect(mocks.activate).toHaveBeenCalledWith('activation-preview', [])
  expect(mocks.dialog).not.toHaveBeenCalled()
  await expect(activateCampaign('C:\\arbitrary', signal())).rejects.toThrow('CONTENT_NOT_FOUND')
  await expect(activateCampaign('unknown', signal())).rejects.toThrow('CONTENT_NOT_FOUND')
})
test('conflicts and existing different active campaign require client review', async () => {
  mocks.prepareActivation.mockResolvedValue({ localId: 'known', conflicts: [{}] })
  expect(await activateCampaign('known', signal())).toMatchObject({
    errorCode: 'ACTION_REQUIRES_REVIEW',
  })
  active = { localId: 'other' }
  await expect(switchCampaign('known', signal())).rejects.toThrow('CONTENT_NOT_FOUND')
  expect(mocks.activate).not.toHaveBeenCalled()
  expect(mocks.deactivate).not.toHaveBeenCalled()
})
test.each(['restore', 'uninstall'] as const)(
  '%s requires bound native approval and returns no filesystem data',
  async (operation) => {
    if (operation === 'restore') setActive()
    const run = operation === 'restore' ? restoreCampaign : uninstallCampaign
    const commit = operation === 'restore' ? mocks.deactivate : mocks.uninstall
    const begin = vi.fn<() => void>()
    const result = await run('known', signal(), begin)
    expect(result.status).toBe('completed')
    expect(commit).toHaveBeenCalledWith(operation + '-preview', [])
    expect(begin).toHaveBeenCalledOnce()
    expect(mocks.dialog).toHaveBeenCalledWith(
      window,
      expect.objectContaining({ buttons: ['取消', '允许操作'], defaultId: 0, cancelId: 0 }),
    )
    expect(JSON.stringify([result, mocks.dialog.mock.calls])).not.toContain('PRIVATE_')
  },
)
test.each([
  'reject',
  'no-window',
  'untrusted',
  'destroyed',
  'aborted',
  'replaced',
  'state-race',
  'file-race',
])('restore refuses mutation on %s', async (scenario) => {
  setActive()
  const controller = new AbortController()
  if (scenario === 'no-window') window = null
  if (scenario === 'untrusted') window.webContents.getURL = () => 'https://untrusted.example/'
  if (scenario === 'destroyed') window.isDestroyed = () => true
  mocks.dialog.mockImplementation(async () => {
    if (scenario === 'aborted') controller.abort()
    if (scenario === 'replaced') window = { ...window }
    if (scenario === 'state-race') record = { ...record, changed: true }
    if (scenario === 'file-race') mocks.hash.mockResolvedValue('edited')
    return { response: scenario === 'reject' ? 0 : 1 }
  })
  const begin = vi.fn<() => void>()
  const outcome = await restoreCampaign('known', controller.signal, begin).catch(
    (error: Error) => ({ status: error.message }),
  )
  expect(outcome.status).toBe(
    scenario === 'aborted'
      ? 'CANCELLED'
      : scenario === 'state-race' || scenario === 'file-race'
        ? 'requires-review'
        : 'cancelled',
  )
  expect(mocks.deactivate).not.toHaveBeenCalled()
  expect(begin).not.toHaveBeenCalled()
})
test('shared, modified, added resources and ownership-unknown cannot be removed', async () => {
  setActive()
  mocks.hash.mockResolvedValue('edited')
  expect(await restoreCampaign('known', signal())).toMatchObject({
    errorCode: 'ACTION_REQUIRES_REVIEW',
  })
  mocks.hash.mockResolvedValue('original')
  mocks.walk.mockImplementation(async (_root, visit) =>
    visit('PRIVATE_FILE', 'added.txt', { isFile: () => true }),
  )
  expect(await restoreCampaign('known', signal())).toMatchObject({
    errorCode: 'ACTION_REQUIRES_REVIEW',
  })
  active.ownershipUnknown = true
  expect(await restoreCampaign('known', signal())).toMatchObject({
    errorCode: 'ACTION_REQUIRES_REVIEW',
  })
  mocks.prepareDeactivation.mockResolvedValue({
    removalId: 'preview',
    localId: 'known',
    operation: 'deactivate',
    files: [{ usedBy: [{}] }],
  })
  expect(await restoreCampaign('known', signal())).toMatchObject({
    errorCode: 'ACTION_REQUIRES_REVIEW',
  })
  expect(mocks.deactivate).not.toHaveBeenCalled()
  expect(mocks.dialog).not.toHaveBeenCalled()
})
test('library uninstall requires explicit native confirmation and stable inventory', async () => {
  record.external = false
  expect(await uninstallCampaign('known', signal())).toMatchObject({ status: 'completed' })
  expect(mocks.uninstall).toHaveBeenCalledWith('uninstall-preview', [])
})
test('abort before preview prevents action; once commit starts no false cancellation result', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(activateCampaign('known', controller.signal)).rejects.toThrow('CANCELLED')
  expect(mocks.prepareActivation).not.toHaveBeenCalled()
  const duringCommit = new AbortController()
  mocks.activate.mockImplementation(async () => {
    duringCommit.abort()
  })
  expect((await activateCampaign('known', duringCommit.signal)).status).toBe('completed')
})
test('activation state race does not enter mutation', async () => {
  mocks.prepareActivation.mockImplementation(async () => {
    active = { localId: 'other' }
    return { activationId: 'preview', localId: 'known', conflicts: [] }
  })
  expect(await activateCampaign('known', signal())).toMatchObject({
    errorCode: 'ACTION_REQUIRES_REVIEW',
  })
  expect(mocks.activate).not.toHaveBeenCalled()
})

test.each(['success', 'activation-conflict', 'aborted-after-restore'])(
  'controlled switch reports %s accurately',
  async (scenario) => {
    const old = { ...record, localId: 'previous' }
    mocks.list.mockImplementation(() => ({ records: [record, old] }))
    active = { localId: 'previous', descriptorPath: 'PRIVATE_ACTIVE', installedFiles: [file] }
    mocks.prepareDeactivation.mockResolvedValue({
      removalId: 'restore-preview',
      localId: 'previous',
      operation: 'deactivate',
      files: [],
    })
    const controller = new AbortController()
    mocks.deactivate.mockImplementation(async () => {
      active = undefined
      if (scenario === 'aborted-after-restore') controller.abort()
    })
    if (scenario === 'activation-conflict')
      mocks.prepareActivation.mockResolvedValue({ localId: 'known', conflicts: [{}] })
    const beginMutation = vi.fn<() => void>()
    const result = await switchCampaign('known', controller.signal, beginMutation)
    expect(beginMutation).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      status: scenario === 'success' ? 'completed' : 'partially-completed',
      restoredId: 'previous',
    })
    expect(mocks.dialog).toHaveBeenCalledOnce()
    const detail = mocks.dialog.mock.calls[0]![1].detail
    expect(detail).toContain('目标战役：Test Campaign')
    expect(detail).toContain('目标 ID：known')
    expect(detail).toContain('停用当前战役 → 激活目标战役')
    expect(mocks.deactivate).toHaveBeenCalledWith('restore-preview', [])
    expect(mocks.activate.mock.calls).toEqual(
      scenario === 'success' ? [['activation-preview', []]] : [],
    )
  },
)
test('library inventory changed while confirmation open refuses uninstall', async () => {
  record.external = false
  mocks.resource.mockResolvedValueOnce({ hash: 'original' }).mockResolvedValue({ hash: 'edited' })
  expect(await uninstallCampaign('known', signal())).toMatchObject({
    errorCode: 'ACTION_REQUIRES_REVIEW',
  })
  expect(mocks.uninstall).not.toHaveBeenCalled()
})
test('navigation invalidates native approval even if trusted origin returns', async () => {
  setActive()
  mocks.dialog.mockImplementation(async () => {
    const invalidate = window!.webContents.on.mock.calls[0]![1]
    invalidate()
    return { response: 1 }
  })
  expect(await restoreCampaign('known', signal())).toMatchObject({ status: 'cancelled' })
  expect(mocks.deactivate).not.toHaveBeenCalled()
  expect(window!.webContents.off).toHaveBeenCalled()
})
