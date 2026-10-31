<script lang="ts" setup>
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import type {
  ReplayRecord,
  ReplayDirectory,
  ReplayDuplicateGroup,
  ReplayAnalysis,
} from '@scnexus/app-shared/types/replay.type'
import ReplayAnalysisDialog from './ReplayAnalysisDialog.vue'
import type { IpcResult } from '@scnexus/app-shared/errors/app.error'
import {
  ipcReplayList,
  ipcReplayScanDirectory,
  ipcReplayIndexFile,
  ipcReplayImportArchive,
  ipcReplayDelete,
  ipcDialogShowOpenDialog,
  ipcReplayDiscoverDirectories,
  ipcReplayListDuplicates,
  ipcReplayChooseExportPath,
  ipcReplayExportArchive,
  ipcReplayAnalyze,
  ipcReplayGetAnalysis,
} from '../../ipcs'

defineOptions({ name: 'ReplayView' })
const { t, locale } = useI18n()
function playedAtLabel(record: ReplayRecord) {
  return record.playedAt
    ? new Date(record.playedAt).toLocaleString(locale.value)
    : t('replay.unknown')
}
function playersLabel(record: ReplayRecord) {
  return record.players.length
    ? record.players
        .map(
          (player) =>
            `${player.name ?? t('replay.unknown')} · ${raceLabel(player.race)} · ${player.result ? t(`replay.result.${player.result}`) : t('replay.unknown')}`,
        )
        .join(' / ')
    : t('replay.unknown')
}
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
const directories = shallowRef<ReplayDirectory[]>([])
const directoriesLoaded = ref(false)
const duplicates = shallowRef<ReplayDuplicateGroup[]>([])
const duplicatesLoaded = ref(false)
const duplicatesOnly = ref(false)
const selected = ref<string[]>([])
const duplicateIds = computed(
  () => new Set(duplicates.value.flatMap((group) => group.replays.map((record) => record.id))),
)
const analysisTarget = shallowRef<ReplayRecord | null>(null)
const analysis = shallowRef<ReplayAnalysis | null>(null)
const analysisLoaded = ref(false)
const analysisError = ref('')
const deleteTarget = shallowRef<ReplayRecord | null>(null)
const deleteOpen = computed({
  get: () => deleteTarget.value !== null,
  set: (open: boolean) => {
    if (!open && !busy.value) deleteTarget.value = null
  },
})
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return records.value.filter(
    (record) =>
      (!duplicatesOnly.value || duplicateIds.value.has(record.id)) &&
      [
        record.fileName,
        record.path,
        record.mapName,
        ...record.players.map((player) => player.name),
      ].some((value) => value?.toLocaleLowerCase().includes(query)),
  )
})
function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(result.error.message || t('replay.failed'))
  return result.data
}
async function refresh() {
  records.value = unwrap(await ipcReplayList())
  selected.value = selected.value.filter((id) => records.value.some((record) => record.id === id))
  if (duplicatesLoaded.value) duplicates.value = unwrap(await ipcReplayListDuplicates())
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
function requestDelete(record: ReplayRecord) {
  analysisTarget.value = null
  deleteTarget.value = record
}
function confirmDelete() {
  return run(async () => {
    if (!deleteTarget.value) return false
    unwrap(await ipcReplayDelete(deleteTarget.value.path))
    deleteTarget.value = null
    return true
  })
}
function discoverDirectories() {
  return run(async () => {
    directories.value = unwrap(await ipcReplayDiscoverDirectories())
    directoriesLoaded.value = true
  })
}
function scanCandidate(path: string) {
  return run(async () => {
    unwrap(await ipcReplayScanDirectory(path))
    return true
  })
}
function showDuplicates() {
  return run(async () => {
    const result = unwrap(await ipcReplayListDuplicates())
    duplicates.value = result
    duplicatesLoaded.value = true
    duplicatesOnly.value = !duplicatesOnly.value
  })
}
function selectRecord(id: string, checked: boolean | 'indeterminate') {
  selected.value =
    checked === true
      ? [...selected.value.filter((value) => value !== id), id]
      : selected.value.filter((value) => value !== id)
}
function exportSelected() {
  return run(async () => {
    if (!selected.value.length) return
    const path = unwrap(await ipcReplayChooseExportPath())
    if (!path) return
    const result = unwrap(await ipcReplayExportArchive([...selected.value], path))
    toast.add({
      title: t('replay.exportSuccess', { count: result.count }),
      description: result.path,
      color: 'success',
    })
  })
}
function showAnalysis(record: ReplayRecord) {
  return run(async () => {
    analysisTarget.value = record
    analysis.value = null
    analysisLoaded.value = false
    analysisError.value = ''
    try {
      analysis.value = unwrap(await ipcReplayGetAnalysis(record.id))
      analysisLoaded.value = true
    } catch (error) {
      analysisError.value = error instanceof Error ? error.message : String(error)
      throw error
    }
  })
}
function analyze(record: ReplayRecord) {
  return run(async () => {
    analysisTarget.value = record
    analysis.value = null
    analysisLoaded.value = false
    analysisError.value = ''
    try {
      analysis.value = unwrap(await ipcReplayAnalyze(record.id))
      analysisLoaded.value = true
      toast.add({ title: t('replay.analysisSaved'), color: 'success' })
    } catch (error) {
      analysisError.value = error instanceof Error ? error.message : String(error)
      throw error
    }
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
    <div class="flex shrink-0 items-center gap-2">
      <UButton
        :disabled="busy"
        variant="outline"
        :label="t('replay.discover')"
        @click="discoverDirectories" />
      <UButton
        :disabled="busy"
        :variant="duplicatesOnly ? 'solid' : 'outline'"
        :label="t(duplicatesOnly ? 'replay.showAll' : 'replay.duplicates')"
        @click="showDuplicates" />
      <span class="text-xs text-muted">{{ t('replay.selected', { count: selected.length }) }}</span>
      <UButton
        :disabled="busy || !selected.length || selected.length > 2000"
        variant="outline"
        :label="t('replay.export')"
        @click="exportSelected" />
      <UButton
        :disabled="busy || !selected.length"
        variant="ghost"
        :label="t('replay.clearSelection')"
        @click="selected = []" />
    </div>
    <UInput
      v-model="search"
      class="w-full shrink-0"
      icon="i-tabler-search"
      :placeholder="t('replay.search')"
      :aria-label="t('replay.search')" />
    <p v-if="busy" role="status" class="text-sm text-muted">{{ t('replay.busy') }}</p>
    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto">
      <section
        v-if="directoriesLoaded"
        class="space-y-2 rounded-lg border border-default p-3"
        :aria-label="t('replay.candidates')">
        <h2 class="text-sm font-medium">{{ t('replay.candidates') }}</h2>
        <p class="text-xs text-muted">{{ t('replay.candidatesNotice') }}</p>
        <p v-if="!directories.length" class="text-sm text-muted">{{ t('replay.noDirectories') }}</p>
        <div v-for="directory in directories" :key="directory.path" class="flex items-center gap-2">
          <p class="min-w-0 flex-1 break-all text-xs">{{ directory.path }}</p>
          <UButton
            :disabled="busy"
            size="xs"
            variant="outline"
            :label="t('replay.scanCandidate')"
            @click="scanCandidate(directory.path)" />
        </div>
      </section>
      <p v-if="duplicatesLoaded" class="text-xs text-muted">
        {{ t('replay.duplicateSummary', { count: duplicates.length }) }}
        {{ t('replay.duplicateNotice') }}
      </p>
      <p class="text-xs text-muted">{{ t('replay.exportNotice') }}</p>
      <p v-if="loaded && !filtered.length" class="py-12 text-center text-muted">
        {{ t(records.length ? 'replay.noMatches' : 'replay.empty') }}
      </p>
      <article
        v-for="record in filtered"
        :key="record.id"
        class="flex min-w-0 items-center gap-3 rounded-lg border border-default px-3 py-2">
        <UCheckbox
          :disabled="busy"
          :model-value="selected.includes(record.id)"
          :aria-label="t('replay.selectRecord', { name: record.fileName })"
          @update:model-value="selectRecord(record.id, $event)" />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2 text-sm leading-5">
            <h2
              class="min-w-0 flex-1 truncate font-medium"
              :title="record.mapName ?? t('replay.unknown')">
              {{ record.mapName ?? t('replay.unknown') }}
            </h2>
            <UBadge
              v-if="duplicateIds.has(record.id)"
              class="shrink-0"
              color="neutral"
              variant="subtle">
              {{ t('replay.duplicate') }}
            </UBadge>
            <time
              class="shrink-0 whitespace-nowrap text-xs text-muted"
              :datetime="record.playedAt ?? undefined">
              {{ playedAtLabel(record) }}
            </time>
          </div>
          <p class="truncate text-xs leading-5 text-muted" :title="playersLabel(record)">
            {{ playersLabel(record) }}
          </p>
        </div>
        <UButton
          :disabled="busy"
          class="shrink-0"
          size="xs"
          variant="ghost"
          :label="t('replay.details')"
          @click="showAnalysis(record)" />
      </article>
    </div>
    <ReplayAnalysisDialog
      v-if="analysisTarget"
      :record="analysisTarget"
      :analysis="analysis"
      :loaded="analysisLoaded"
      :error="analysisError"
      :busy="busy"
      @close="analysisTarget = null"
      @analyze="analyze(analysisTarget)"
      @delete="requestDelete(analysisTarget)" />
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
