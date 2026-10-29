import { afterEach, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useWorkshopStore } from '../workshop'
import { useAuthStore } from '../auth'
import { useContentCenterStore } from '../content-center'
import type { WorkshopTask } from '@scnexus/app-shared/types/workshop.type'
const mocks = vi.hoisted(() => ({
  list: vi.fn<() => Promise<unknown>>(),
  stop: vi.fn<() => void>(),
  subscribe: vi.fn<(listener: (task: WorkshopTask) => void) => () => void>(),
}))
vi.mock('../../ipcs/workshop', () => ({
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
  await vi.waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2))
  await vi.waitFor(() => expect(store.downloads[0]?.source?.kind).toBe('github'))
  stop()
  expect(mocks.stop).toHaveBeenCalledOnce()
})
