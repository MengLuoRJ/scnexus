import { afterEach, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useWorkshopStore } from '../workshop'
import { useAuthStore } from '../auth'
import { useContentCenterStore } from '../content-center'
import type { WorkshopTask } from '@scnexus/app-shared/types/workshop.type'
const mocks = vi.hoisted(() => ({
  detail: vi.fn<(scnid: number) => Promise<unknown>>(),
  download: vi.fn<(source: unknown) => Promise<unknown>>(),
  preview: vi.fn<() => Promise<unknown>>(),
  confirm: vi.fn<() => Promise<unknown>>(),
  remove: vi.fn<() => Promise<unknown>>(),
  list: vi.fn<() => Promise<unknown>>(),
  stop: vi.fn<() => void>(),
  subscribe: vi.fn<(listener: (task: WorkshopTask) => void) => () => void>(),
}))
vi.mock('../../apis/workshop', () => ({ apiWorkshopDetail: mocks.detail }))
vi.mock('../../ipcs/workshop', () => ({
  ipcWorkshopDownload: mocks.download,
  ipcWorkshopPreviewGithub: mocks.preview,
  ipcWorkshopConfirmGithub: mocks.confirm,
  ipcWorkshopRemoveDownload: mocks.remove,
  ipcWorkshopList: mocks.list,
  ipcWorkshopOnChanged: mocks.subscribe,
}))
afterEach(() => vi.clearAllMocks())
test('anonymous GitHub tasks remain loadable when workshop is disabled and the account changes', async () => {
  setActivePinia(createPinia())
  const task: WorkshopTask = {
    taskId: 'github-task',
    kind: 'download',
    status: 'running',
    name: 'Repository',
    transferred: 0,
    size: 0,
    source: { kind: 'github', repository: 'https://github.com/owner/repo', revision: 'main' },
  }
  mocks.list.mockResolvedValue({ ok: true, data: [task] })
  mocks.subscribe.mockReturnValue(mocks.stop)
  const store = useWorkshopStore()
  const stop = store.connect()
  await vi.waitFor(() => expect(store.downloads).toHaveLength(1))
  const center = useContentCenterStore()
  center.enabled = false
  const auth = useAuthStore()
  auth.snapshot = { ...auth.snapshot, epoch: auth.snapshot.epoch + 1 }
  await nextTick()
  await vi.waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(3))
  await vi.waitFor(() => expect(store.downloads[0]?.source?.kind).toBe('github'))
  stop()
  expect(mocks.stop).toHaveBeenCalledOnce()
})

test('workshop preview resolves the approved version and confirmation uses that fixed version', async () => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.snapshot = { ...auth.snapshot, status: 'signed-in' }
  mocks.detail.mockResolvedValue({ scnid: 42, approvedVersionId: 'version-latest' })
  const task = { taskId: 'workshop-task', source: { kind: 'workshop' } }
  mocks.download.mockResolvedValue({ ok: true, data: task })
  const store = useWorkshopStore()
  store.openDownload(42)
  await store.previewDownload()
  expect(mocks.download).not.toHaveBeenCalled()
  mocks.detail.mockResolvedValue({ scnid: 42, approvedVersionId: 'newer-version' })
  await expect(store.confirmDownload()).resolves.toEqual(task)
  expect(mocks.detail).toHaveBeenCalledExactlyOnceWith(42)
  expect(mocks.download).toHaveBeenCalledExactlyOnceWith({
    kind: 'workshop',
    projectScnid: 42,
    versionId: 'version-latest',
  })
  expect(store.tasks).toContainEqual(task)
})

test('workshop download rejects anonymous, disabled and invalid scnid before lookup', async () => {
  setActivePinia(createPinia())
  const store = useWorkshopStore()
  store.openDownload(0)
  await expect(store.previewDownload()).rejects.toThrow('WORKSHOP_SCNID_INVALID')
  store.openDownload(42)
  await expect(store.previewDownload()).rejects.toThrow('WORKSHOP_LOGIN_REQUIRED')
  useContentCenterStore().enabled = false
  store.openDownload(42)
  await expect(store.previewDownload()).rejects.toThrow('WORKSHOP_DISABLED')
  expect(mocks.detail).not.toHaveBeenCalled()
  expect(mocks.download).not.toHaveBeenCalled()
})

test('projects without approved versions never create a download', async () => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.snapshot = { ...auth.snapshot, status: 'signed-in' }
  mocks.detail.mockResolvedValue({ scnid: 42, approvedVersionId: null })
  const store = useWorkshopStore()
  store.openDownload(42)
  await expect(store.previewDownload()).rejects.toThrow('WORKSHOP_NO_PUBLISHED_VERSION')
  expect(mocks.download).not.toHaveBeenCalled()
})

test('account changes or disabling workshop during lookup prevent task creation', async () => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.snapshot = { ...auth.snapshot, status: 'signed-in' }
  let resolve!: (value: unknown) => void
  mocks.detail.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const store = useWorkshopStore()
  store.openDownload(42)
  const pending = store.previewDownload()
  auth.snapshot = { ...auth.snapshot, epoch: auth.snapshot.epoch + 1 }
  resolve({ scnid: 42, approvedVersionId: 'version-latest' })
  await expect(pending).rejects.toThrow('WORKSHOP_SESSION_CHANGED')
  expect(mocks.download).not.toHaveBeenCalled()
})

test('GitHub preview does not create tasks; only confirmation consumes the preview ID', async () => {
  setActivePinia(createPinia())
  const store = useWorkshopStore()
  store.openDownload()
  store.draft.repository = 'https://github.com/owner/repo'
  mocks.preview.mockResolvedValue({
    ok: true,
    data: {
      previewId: 'fixed-commit',
      source: { kind: 'github', repository: store.draft.repository, revision: 'commit' },
      manifest: { name: 'Example', version: '1.0.0' },
    },
  })
  mocks.confirm.mockResolvedValue({
    ok: true,
    data: { taskId: 'github', kind: 'download', status: 'running' },
  })
  await store.previewDownload()
  expect(store.tasks).toEqual([])
  expect(mocks.download).not.toHaveBeenCalled()
  expect(mocks.confirm).not.toHaveBeenCalled()
  expect(store.preview?.manifest?.name).toBe('Example')
  await store.confirmDownload()
  expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith('fixed-commit')
  expect(store.wizardOpen).toBe(false)
})
test('account or workshop toggle changes invalidate a previously approved preview', async () => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.snapshot = { ...auth.snapshot, status: 'signed-in' }
  const store = useWorkshopStore()
  store.openDownload(42)
  mocks.detail.mockResolvedValue({ scnid: 42, approvedVersionId: 'v1' })
  await store.previewDownload()
  const stale = store.preview
  useContentCenterStore().enabled = false
  await nextTick()
  useContentCenterStore().enabled = true
  await nextTick()
  store.preview = stale
  await expect(store.confirmDownload()).rejects.toThrow('WORKSHOP_SESSION_CHANGED')
  expect(mocks.download).not.toHaveBeenCalled()
})
test('removed records cannot be revived by a late event or stale list result', async () => {
  setActivePinia(createPinia())
  const store = useWorkshopStore()
  const task: WorkshopTask = {
    taskId: 'removed',
    kind: 'download',
    status: 'completed',
    name: 'Old',
    transferred: 1,
    size: 1,
  }
  store.accept(task)
  mocks.remove.mockResolvedValue({ ok: true, data: undefined })
  mocks.list.mockResolvedValue({ ok: true, data: [task] })
  await store.removeDownload(task.taskId, true)
  store.accept(task)
  expect(store.tasks).toEqual([])
  expect(mocks.remove).toHaveBeenCalledWith(task.taskId, true)
  store.accept({ ...task, taskId: 'running', status: 'running' })
  await expect(store.removeDownload('running', false)).rejects.toThrow('DOWNLOAD_RUNNING')
})
