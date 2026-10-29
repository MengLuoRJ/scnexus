import { computed, shallowRef, watch } from 'vue'
import { useAuthStore } from './auth'
import { useContentCenterStore } from './content-center'
import { defineStore } from 'pinia'
import type { IpcResult } from '@scnexus/app-shared/errors/app.error'
import type { WorkshopTask } from '@scnexus/app-shared/types/workshop.type'
import { ipcWorkshopList, ipcWorkshopOnChanged } from '../ipcs/workshop'
export function unwrapWorkshop<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(result.error.description)
  return result.data
}
export const useWorkshopStore = defineStore('workshop', () => {
  const auth = useAuthStore()
  const center = useContentCenterStore()
  const tasks = shallowRef<WorkshopTask[]>([])
  const loading = shallowRef(false)
  const error = shallowRef<unknown>(null)
  const downloads = computed(() => tasks.value.filter((task) => task.kind === 'download'))
  const uploads = computed(() => tasks.value.filter((task) => task.kind !== 'download'))
  let stop: (() => void) | undefined
  let users = 0
  let generation = 0
  function accept(task: WorkshopTask) {
    tasks.value = [task, ...tasks.value.filter((item) => item.taskId !== task.taskId)]
  }
  async function load() {
    const current = ++generation
    loading.value = true
    error.value = null
    try {
      const items = unwrapWorkshop(await ipcWorkshopList())
      if (current === generation) tasks.value = items
    } catch (value) {
      if (current === generation) error.value = value
    } finally {
      if (current === generation) loading.value = false
    }
  }
  watch(
    () => [auth.snapshot.epoch, auth.snapshot.sessionId, center.enabled],
    () => {
      generation++
      tasks.value = []
      error.value = null
      if (users > 0) void load()
    },
  )
  function connect() {
    users++
    if (!stop) {
      stop = ipcWorkshopOnChanged(accept)
      void load()
    }
    return () => {
      if (--users === 0) {
        stop?.()
        stop = undefined
        generation++
        loading.value = false
      }
    }
  }
  return { tasks, downloads, uploads, loading, error, accept, load, connect }
})
