import { computed, ref, shallowRef, watch } from 'vue'
import { useAuthStore } from './auth'
import { useContentCenterStore } from './content-center'
import { defineStore } from 'pinia'
import type { IpcResult } from '@scnexus/app-shared/errors/app.error'
import type { WorkshopTask, WorkshopSource } from '@scnexus/app-shared/types/workshop.type'
import {
  ipcWorkshopDownload,
  ipcWorkshopList,
  ipcWorkshopOnChanged,
  ipcWorkshopPreviewGithub,
  ipcWorkshopConfirmGithub,
  ipcWorkshopRemoveDownload,
} from '../ipcs/workshop'

import { apiWorkshopDetail } from '../apis/workshop'

type DownloadPreview = {
  source: WorkshopSource
  previewId?: string
  manifest?: Record<string, unknown>
  project?: { scnid: number; title: string; description: string; approvedVersionId: string }
  epoch: number
  access: number
}
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
  const wizardOpen = shallowRef(false)
  const preview = shallowRef<DownloadPreview | null>(null)
  const draft = ref({
    kind: 'github' as 'github' | 'workshop',
    repository: '',
    revision: 'main',
    scnid: '',
  })
  const removed = new Set<string>()
  let intent = 0
  let access = 0
  function openDownload(scnid?: number) {
    intent++
    preview.value = null
    draft.value =
      scnid !== undefined
        ? { kind: 'workshop', scnid: String(scnid), repository: '', revision: 'main' }
        : { kind: 'github', scnid: '', repository: '', revision: 'main' }
    wizardOpen.value = true
  }
  function closeDownload() {
    intent++
    wizardOpen.value = false
    preview.value = null
  }
  function accept(task: WorkshopTask) {
    if (removed.has(task.taskId)) return
    tasks.value = [task, ...tasks.value.filter((item) => item.taskId !== task.taskId)]
  }
  function checkWorkshop(epoch: number, expectedAccess: number) {
    if (
      !center.enabled ||
      !auth.signedIn ||
      auth.snapshot.epoch !== epoch ||
      access !== expectedAccess
    )
      throw new Error('WORKSHOP_SESSION_CHANGED')
  }
  async function previewDownload() {
    const current = ++intent
    preview.value = null
    const epoch = auth.snapshot.epoch
    const expectedAccess = access
    const input = { ...draft.value }
    if (input.kind === 'github') {
      const result = unwrapWorkshop(
        await ipcWorkshopPreviewGithub({
          kind: 'github',
          repository: input.repository.trim(),
          revision: input.revision.trim(),
        }),
      )
      if (current === intent) preview.value = { ...result, epoch, access: expectedAccess }
      return
    }
    const scnid = Number(input.scnid)
    if (!/^[1-9]\d*$/.test(input.scnid.trim()) || !Number.isInteger(scnid) || scnid > 2147483647)
      throw new Error('WORKSHOP_SCNID_INVALID')
    if (!center.enabled) throw new Error('WORKSHOP_DISABLED')
    if (!auth.signedIn) throw new Error('WORKSHOP_LOGIN_REQUIRED')
    const project = await apiWorkshopDetail(scnid)
    checkWorkshop(epoch, expectedAccess)
    if (!project.approvedVersionId) throw new Error('WORKSHOP_NO_PUBLISHED_VERSION')
    if (current === intent)
      preview.value = {
        source: { kind: 'workshop', projectScnid: scnid, versionId: project.approvedVersionId },
        project: {
          scnid,
          title: project.title,
          description: project.description,
          approvedVersionId: project.approvedVersionId,
        },
        epoch,
        access: expectedAccess,
      }
  }
  async function confirmDownload() {
    const value = preview.value
    if (!value) throw new Error('DOWNLOAD_PREVIEW_REQUIRED')
    if (value.source.kind === 'workshop') checkWorkshop(value.epoch, value.access)
    const task = unwrapWorkshop(
      await (value.previewId
        ? ipcWorkshopConfirmGithub(value.previewId)
        : ipcWorkshopDownload(value.source)),
    )
    if (
      value.source.kind !== 'workshop' ||
      (center.enabled &&
        auth.signedIn &&
        auth.snapshot.epoch === value.epoch &&
        access === value.access)
    )
      accept(task)
    closeDownload()
    return task
  }
  async function removeDownload(taskId: string, deleteFile: boolean) {
    if (tasks.value.some((task) => task.taskId === taskId && task.status === 'running'))
      throw new Error('DOWNLOAD_RUNNING')
    unwrapWorkshop(await ipcWorkshopRemoveDownload(taskId, deleteFile))
    removed.add(taskId)
    generation++
    tasks.value = tasks.value.filter((task) => task.taskId !== taskId)
    await load()
  }
  async function load() {
    const current = ++generation
    loading.value = true
    error.value = null
    try {
      const items = unwrapWorkshop(await ipcWorkshopList())
      if (current === generation) tasks.value = items.filter((task) => !removed.has(task.taskId))
    } catch (value) {
      if (current === generation) error.value = value
    } finally {
      if (current === generation) loading.value = false
    }
  }
  watch(
    () => [auth.snapshot.epoch, auth.snapshot.sessionId, center.enabled],
    () => {
      access++
      if (preview.value?.source.kind === 'workshop') {
        intent++
        preview.value = null
      }
      generation++
      tasks.value = tasks.value.filter((task) => task.source?.kind === 'github')
      error.value = null
      if (users > 0) void load()
    },
    { flush: 'sync' },
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
  return {
    tasks,
    downloads,
    uploads,
    loading,
    error,
    accept,
    load,
    connect,
    wizardOpen,
    preview,
    draft,
    openDownload,
    closeDownload,
    previewDownload,
    confirmDownload,
    removeDownload,
  }
})
