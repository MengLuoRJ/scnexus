<script lang="ts" setup>
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import type { IpcResult } from '@scnexus/app-shared/errors/app.error'
import {
  ipcReplayList,
  ipcReplayScanDirectory,
  ipcReplayIndexFile,
  ipcReplayImportArchive,
  ipcReplayDelete,
  ipcDialogShowOpenDialog,
} from '../../ipcs'

defineOptions({ name: 'ReplayView' })
const { t } = useI18n()
function raceLabel(race: string | null) {
  if (!race) return t('replay.unknown')
  const normalized = race.toLowerCase()
  return ['terran', 'zerg', 'protoss', 'random'].includes(normalized)
    ? t(`replay.race.${normalized}`)
    : race
}
const toast = useToast()
const records = shallowRef<ReplayRecord[]>([])
const search = ref('')
const busy = ref(false)
const loaded = ref(false)
const deleteTarget = shallowRef<ReplayRecord | null>(null)
const deleteOpen = computed({
  get: () => deleteTarget.value !== null,
  set: (open: boolean) => {
    if (!open && !busy.value) deleteTarget.value = null
  },
})
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return records.value.filter((record) =>
    [
      record.fileName,
      record.path,
      record.mapName,
      ...record.players.map((player) => player.name),
    ].some((value) => value?.toLocaleLowerCase().includes(query)),
  )
})
function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}
async function refresh() {
  records.value = unwrap(await ipcReplayList())
  loaded.value = true
}
async function run(action: () => Promise<boolean | void>) {
  if (busy.value) return
  busy.value = true
  try {
    const changed = await action()
    if (changed) {
      await refresh()
      toast.add({ title: t('replay.success'), color: 'success' })
    }
  } catch (error) {
    toast.add({
      title: t('replay.failed'),
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    busy.value = false
  }
}
async function pick(kind: 'directory' | 'replay' | 'archive', title?: string) {
  const result = unwrap(
    await ipcDialogShowOpenDialog({
      title:
        title ??
        t(
          kind === 'directory'
            ? 'replay.scan'
            : kind === 'replay'
              ? 'replay.index'
              : 'replay.import',
        ),
      properties: [kind === 'directory' ? 'openDirectory' : 'openFile'],
      ...(kind === 'directory'
        ? {}
        : {
            filters: [
              {
                name: t(kind === 'replay' ? 'replay.title' : 'replay.archive'),
                extensions: kind === 'replay' ? ['SC2Replay'] : ['zip', '7z', 'rar'],
              },
            ],
          }),
    }),
  )
  return result.canceled ? undefined : result.filePaths[0]
}
function scan() {
  return run(async () => {
    const path = await pick('directory')
    if (!path) return false
    unwrap(await ipcReplayScanDirectory(path))
    return true
  })
}
function indexFile() {
  return run(async () => {
    const path = await pick('replay')
    if (!path) return false
    unwrap(await ipcReplayIndexFile(path))
    return true
  })
}
function importArchive() {
  return run(async () => {
    const archive = await pick('archive')
    if (!archive) return false
    const destination = await pick('directory', t('replay.destination'))
    if (!destination) return false
    unwrap(await ipcReplayImportArchive(archive, destination))
    return true
  })
}
function confirmDelete() {
  return run(async () => {
    if (!deleteTarget.value) return false
    unwrap(await ipcReplayDelete(deleteTarget.value.path))
    deleteTarget.value = null
    return true
  })
}
onMounted(() => run(refresh))
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4" :aria-busy="busy">
    <div class="flex shrink-0 items-center justify-between gap-2">
      <h1 class="text-lg font-semibold">{{ t('replay.title') }}</h1>
      <UButton
        :disabled="busy"
        variant="ghost"
        icon="i-tabler-refresh"
        :label="t('replay.refresh')"
        @click="run(refresh)" />
    </div>
    <p class="shrink-0 text-sm text-muted">{{ t('replay.description') }}</p>
    <div class="flex shrink-0 items-center gap-2">
      <UButton :disabled="busy" :label="t('replay.scan')" @click="scan" />
      <UButton :disabled="busy" variant="outline" :label="t('replay.index')" @click="indexFile" />
      <UButton
        :disabled="busy"
        variant="outline"
        :label="t('replay.import')"
        @click="importArchive" />
    </div>
    <UInput
      v-model="search"
      class="w-full shrink-0"
      icon="i-tabler-search"
      :placeholder="t('replay.search')"
      :aria-label="t('replay.search')" />
    <p v-if="busy" role="status" class="text-sm text-muted">{{ t('replay.busy') }}</p>
    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto">
      <p v-if="loaded && !filtered.length" class="py-12 text-center text-muted">
        {{ t(records.length ? 'replay.noMatches' : 'replay.empty') }}
      </p>
      <article
        v-for="record in filtered"
        :key="record.id"
        class="rounded-lg border border-default p-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1 space-y-1">
            <h2 class="break-all font-medium">{{ record.fileName }}</h2>
            <p class="break-all text-xs text-muted">{{ record.path }}</p>
          </div>
          <UButton
            :disabled="busy"
            color="error"
            variant="ghost"
            :label="t('replay.delete')"
            @click="deleteTarget = record" />
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <UBadge :color="record.status === 'supported' ? 'success' : 'warning'" variant="subtle">
            {{ t(`replay.status.${record.status}`) }}
          </UBadge>
          <span>{{ t(`replay.support.${record.supportLevel}`) }}</span>
          <span>{{ (record.sizeBytes / 1024).toFixed(1) }} KiB</span>
        </div>
        <dl class="mt-2 grid grid-cols-3 gap-2 text-sm">
          <div class="min-w-0">
            <dt class="text-xs text-muted">{{ t('replay.map') }}</dt>
            <dd class="break-words">{{ record.mapName ?? t('replay.unknown') }}</dd>
          </div>
          <div class="min-w-0">
            <dt class="text-xs text-muted">{{ t('replay.version') }}</dt>
            <dd class="break-words">{{ record.gameVersion ?? t('replay.unknown') }}</dd>
            <dd class="text-xs text-muted">
              {{ t('replay.baseBuild') }}: {{ record.baseBuild ?? t('replay.unknown') }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">{{ t('replay.duration') }}</dt>
            <dd>
              {{
                record.durationSeconds === null
                  ? t('replay.unknown')
                  : `${Math.floor(record.durationSeconds / 60)}:${String(Math.floor(record.durationSeconds % 60)).padStart(2, '0')}`
              }}
            </dd>
          </div>
        </dl>
        <div class="mt-2 text-sm">
          <h3 class="text-xs text-muted">{{ t('replay.players') }}</h3>
          <p v-if="!record.players.length">{{ t('replay.unknown') }}</p>
          <ul v-else class="space-y-1">
            <li
              v-for="player in record.players"
              :key="player.slot"
              class="flex flex-wrap gap-x-3 gap-y-0.5 break-all">
              <span class="font-medium">{{ player.name ?? t('replay.unknown') }}</span>
              <span>{{ t('replay.race') }}: {{ raceLabel(player.race) }}</span>
              <span>{{ t('replay.team') }}: {{ player.team ?? t('replay.unknown') }}</span>
              <span>
                {{ t('replay.result') }}:
                {{ player.result ? t(`replay.result.${player.result}`) : t('replay.unknown') }}
              </span>
            </li>
          </ul>
        </div>
        <p v-if="record.supportLevel !== 'full'" class="mt-2 text-xs text-warning">
          {{ t('replay.partialNotice') }}
        </p>
        <ul
          v-if="record.warnings.length"
          class="mt-1 list-inside list-disc break-words text-xs text-muted">
          <li v-for="(warning, index) in record.warnings" :key="index">{{ warning }}</li>
        </ul>
      </article>
    </div>
    <UModal
      v-model:open="deleteOpen"
      :dismissible="!busy"
      :title="t('replay.deleteTitle')"
      :description="t('replay.deleteWarning')">
      <template #body>
        <p class="break-all text-sm">{{ deleteTarget?.path }}</p>
      </template>
      <template #footer>
        <UButton
          :disabled="busy"
          color="neutral"
          variant="outline"
          :label="t('replay.cancel')"
          @click="deleteTarget = null" />
        <UButton
          :loading="busy"
          :disabled="busy"
          color="error"
          :label="t('replay.deleteConfirm')"
          @click="confirmDelete" />
      </template>
    </UModal>
  </section>
</template>
