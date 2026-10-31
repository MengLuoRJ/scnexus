<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import type {
  ReplayRecord,
  StarCraftProfile,
  ReplayScope,
  ReplayCategory,
  ReplayAnalysis,
} from '@scnexus/app-shared/types/replay.type'
import ReplayAnalysisDialog from './ReplayAnalysisDialog.vue'
import { replayPlayerName, replayResultClass } from './display'
import type { IpcResult } from '@scnexus/app-shared/errors/app.error'
import {
  ipcReplayScan,
  ipcReplayImportFile,
  ipcReplayImportArchive,
  ipcReplayDelete,
  ipcDialogShowOpenDialog,
  ipcReplayProfiles,
  ipcSettingOnChanged,
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
        .map((player) =>
          t('replay.playerRace', {
            name: replayPlayerName(player.name, t('replay.unknown')),
            race: raceLabel(player.race),
          }),
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
const profilesLoaded = ref(false)
let settingsGeneration = 0
const profiles = shallowRef<StarCraftProfile[]>([])
const profileHandle = ref('')
const category = ref<ReplayCategory>('Multiplayer')
const scope = computed<ReplayScope | null>(() =>
  profileHandle.value ? { profileHandle: profileHandle.value, category: category.value } : null,
)
const profileItems = computed(() =>
  profiles.value.map((profile) => ({ label: profile.handle, value: profile.handle })),
)
const categoryItems = computed(() =>
  ['Multiplayer', 'Campaign', 'Challenge'].map((value) => ({
    label: t(`replay.category.${value}`),
    value,
  })),
)
let generation = 0
function clearScope() {
  generation++
  records.value = []
  loaded.value = false
  selected.value = []
  search.value = ''
  exportMode.value = false
  analysisTarget.value = null
  deleteTarget.value = null
}
function requireScope(): ReplayScope {
  if (!scope.value) throw new Error(t('replay.chooseProfile'))
  return { ...scope.value }
}
const exportMode = ref(false)
const selected = ref<string[]>([])
const importItems = computed(() => [
  { label: t('replay.index'), disabled: busy.value || !scope.value, onSelect: () => indexFile() },
  {
    label: t('replay.import'),
    disabled: busy.value || !scope.value,
    onSelect: () => importArchive(),
  },
])
function toggleExportMode() {
  if (busy.value || !scope.value) return
  exportMode.value = !exportMode.value
  selected.value = []
}
function selectVisible() {
  if (!exportMode.value || busy.value || !scope.value) return
  selected.value = [...new Set([...selected.value, ...filtered.value.map((record) => record.id)])]
}
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
  return records.value.filter((record) =>
    [
      record.fileName,
      record.path,
      record.mapName,
      ...record.players.map((player) => replayPlayerName(player.name, t('replay.unknown'))),
    ].some((value) => value?.toLocaleLowerCase().includes(query)),
  )
})
function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(result.error.message || t('replay.failed'))
  return result.data
}
async function refresh() {
  const current = requireScope()
  const token = generation
  const result = unwrap(await ipcReplayScan(current))
  if (token !== generation) return
  records.value = result
  selected.value = selected.value.filter((id) => records.value.some((record) => record.id === id))
  loaded.value = true
}
async function loadProfiles() {
  const token = generation
  const result = unwrap(await ipcReplayProfiles())
  if (token !== generation) return
  profiles.value = result
  profilesLoaded.value = true
  if (!result.some((profile) => profile.handle === profileHandle.value)) {
    profileHandle.value = ''
    clearScope()
  }
}
function changeProfile(value: string) {
  if (busy.value) return
  clearScope()
  profileHandle.value = value
  if (value) return run(refresh)
}
function changeCategory(value: ReplayCategory) {
  if (busy.value) return
  clearScope()
  category.value = value
  if (scope.value) return run(refresh)
}
async function run(action: () => Promise<boolean | void>) {
  if (busy.value) return
  busy.value = true
  const token = generation
  try {
    const changed = await action()
    if (changed && token === generation) {
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
    if (settingsGeneration) {
      settingsGeneration = 0
      void run(loadProfiles)
    }
  }
}
async function pick(kind: 'replay' | 'archive') {
  const result = unwrap(
    await ipcDialogShowOpenDialog({
      title: t(kind === 'replay' ? 'replay.index' : 'replay.import'),
      properties: ['openFile'],
      filters: [
        {
          name: t(kind === 'replay' ? 'replay.title' : 'replay.archive'),
          extensions: kind === 'replay' ? ['SC2Replay'] : ['zip', '7z', 'rar'],
        },
      ],
    }),
  )
  return result.canceled ? undefined : result.filePaths[0]
}
function indexFile() {
  return run(async () => {
    const current = requireScope()
    const token = generation
    const path = await pick('replay')
    if (!path || token !== generation) return false
    unwrap(await ipcReplayImportFile(current, path))
    return true
  })
}
function importArchive() {
  return run(async () => {
    const current = requireScope()
    const token = generation
    const archive = await pick('archive')
    if (!archive || token !== generation) return false
    unwrap(await ipcReplayImportArchive(current, archive))
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
    unwrap(await ipcReplayDelete(requireScope(), deleteTarget.value.id))
    deleteTarget.value = null
    return true
  })
}
function selectRecord(id: string, checked: boolean | 'indeterminate') {
  if (!exportMode.value || busy.value || !scope.value) return
  selected.value =
    checked === true
      ? [...selected.value.filter((value) => value !== id), id]
      : selected.value.filter((value) => value !== id)
}
function exportSelected() {
  return run(async () => {
    if (!exportMode.value || !selected.value.length || selected.value.length > 2000) return
    const current = requireScope()
    const ids = [...selected.value]
    const token = generation
    const path = unwrap(await ipcReplayChooseExportPath())
    if (!path || token !== generation) return
    const result = unwrap(await ipcReplayExportArchive(current, ids, path))
    toast.add({
      title: t('replay.exportSuccess', { count: result.count }),
      description: result.path,
      color: 'success',
    })
  })
}
function showAnalysis(record: ReplayRecord) {
  return run(async () => {
    const current = requireScope()
    const token = generation
    analysisTarget.value = record
    analysis.value = null
    analysisLoaded.value = false
    analysisError.value = ''
    try {
      const result = unwrap(await ipcReplayGetAnalysis(current, record.id))
      if (token !== generation) return
      analysis.value = result
      analysisLoaded.value = true
    } catch (error) {
      if (token !== generation) return
      analysisError.value = error instanceof Error ? error.message : String(error)
      throw error
    }
  })
}
function analyze(record: ReplayRecord) {
  return run(async () => {
    const current = requireScope()
    const token = generation
    analysisTarget.value = record
    analysis.value = null
    analysisLoaded.value = false
    analysisError.value = ''
    try {
      const result = unwrap(await ipcReplayAnalyze(current, record.id))
      if (token !== generation) return
      analysis.value = result
      analysisLoaded.value = true
      toast.add({ title: t('replay.analysisSaved'), color: 'success' })
    } catch (error) {
      if (token !== generation) return
      analysisError.value = error instanceof Error ? error.message : String(error)
      throw error
    }
  })
}
let stopSettings: (() => void) | undefined
let previousDocumentsDirectory: string | undefined
onMounted(() => {
  void run(loadProfiles)
  if (window.scnexus)
    stopSettings = ipcSettingOnChanged((snapshot) => {
      const directory = snapshot.effectiveStarCraftDocumentsDirectory
      if (directory === previousDocumentsDirectory) return
      previousDocumentsDirectory = directory
      clearScope()
      profiles.value = []
      profilesLoaded.value = false
      profileHandle.value = ''
      if (busy.value) settingsGeneration++
      else void run(loadProfiles)
    })
})
onUnmounted(() => {
  generation++
  stopSettings?.()
})
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4" :aria-busy="busy">
    <div class="flex shrink-0 items-center justify-between gap-2">
      <h1 class="text-lg font-semibold">{{ t('replay.title') }}</h1>
      <div class="flex shrink-0 items-center gap-2">
        <UButton
          :disabled="busy || !scope"
          variant="ghost"
          icon="i-tabler-refresh"
          :label="t('replay.refresh')"
          @click="run(refresh)" />
        <UDropdownMenu :items="importItems">
          <UButton
            :disabled="busy || !scope"
            variant="outline"
            trailing-icon="i-tabler-chevron-down"
            :label="t('replay.importMenu')" />
        </UDropdownMenu>
        <UButton
          :disabled="busy || !scope"
          :variant="exportMode ? 'solid' : 'outline'"
          :aria-pressed="exportMode"
          :label="t(exportMode ? 'replay.cancel' : 'replay.multiExport')"
          @click="toggleExportMode" />
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <USelect
        class="min-w-0 flex-1"
        :disabled="busy || !profiles.length"
        :items="profileItems"
        :model-value="profileHandle || undefined"
        :placeholder="t('replay.chooseProfile')"
        :aria-label="t('replay.profile')"
        @update:model-value="changeProfile($event as string)" />
      <USelect
        class="w-36 shrink-0"
        :disabled="busy || !profileHandle"
        :items="categoryItems"
        :model-value="category"
        :aria-label="t('replay.categoryLabel')"
        @update:model-value="changeCategory($event as ReplayCategory)" />
    </div>
    <div v-if="exportMode" class="flex shrink-0 items-center gap-2">
      <span class="text-xs text-muted">{{ t('replay.selected', { count: selected.length }) }}</span>
      <UButton
        :disabled="busy || !scope || !filtered.length"
        variant="ghost"
        :label="t('replay.selectVisible')"
        @click="selectVisible" />
      <UButton
        :disabled="busy || !scope || !selected.length"
        variant="ghost"
        :label="t('replay.clearSelection')"
        @click="selected = []" />
      <UButton
        :disabled="busy || !scope || !selected.length || selected.length > 2000"
        variant="outline"
        :label="t('replay.export')"
        @click="exportSelected" />
    </div>
    <UInput
      v-model="search"
      class="w-full shrink-0"
      icon="i-tabler-search"
      :placeholder="t('replay.search')"
      :aria-label="t('replay.search')" />
    <p v-if="busy" role="status" class="text-sm text-muted">{{ t('replay.busy') }}</p>
    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto">
      <p v-if="profilesLoaded && !profiles.length && !busy" class="text-sm text-muted">
        {{ t('replay.noProfiles') }}
        <RouterLink to="/settings" class="text-primary underline">
          {{ t('replay.openSettings') }}
        </RouterLink>
      </p>
      <p v-else-if="!scope" class="text-sm text-muted">{{ t('replay.chooseProfile') }}</p>
      <p v-if="loaded && !filtered.length" class="py-12 text-center text-muted">
        {{ t(records.length ? 'replay.noMatches' : 'replay.empty') }}
      </p>
      <article
        v-for="record in filtered"
        :key="record.id"
        class="flex min-w-0 items-center gap-3 rounded-lg border border-default px-3 py-2">
        <UCheckbox
          v-if="exportMode"
          :disabled="busy || !scope"
          :model-value="selected.includes(record.id)"
          :aria-label="t('replay.selectRecord', { name: record.fileName })"
          @update:model-value="selectRecord(record.id, $event)" />
        <div
          class="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] grid-rows-2 items-center gap-x-3 text-sm leading-5">
          <h2 class="min-w-0 truncate font-medium" :title="record.mapName ?? t('replay.unknown')">
            {{ record.mapName ?? t('replay.unknown') }}
          </h2>
          <div
            class="min-w-0 truncate text-right text-xs"
            :title="
              record.players
                .map(
                  (player) =>
                    `${replayPlayerName(player.name, t('replay.unknown'))}: ${player.result ? t(`replay.result.${player.result}`) : t('replay.unknown')}`,
                )
                .join(' / ')
            "
            :aria-label="t('replay.result')">
            <template v-if="record.players.length">
              <template v-for="(player, index) in record.players" :key="player.slot">
                <span v-if="index" class="text-muted">/</span>
                <span :class="replayResultClass(player.result)">
                  {{ replayPlayerName(player.name, t('replay.unknown')) }}:
                  {{ player.result ? t(`replay.result.${player.result}`) : t('replay.unknown') }}
                </span>
              </template>
            </template>
            <span v-else class="text-muted">{{ t('replay.unknown') }}</span>
          </div>
          <p class="min-w-0 truncate text-xs text-muted" :title="playersLabel(record)">
            {{ playersLabel(record) }}
          </p>
          <div class="flex min-w-0 items-center justify-end gap-2">
            <time
              class="min-w-0 truncate text-xs text-muted"
              :title="playedAtLabel(record)"
              :datetime="record.playedAt ?? undefined">
              {{ playedAtLabel(record) }}
            </time>
            <UButton
              :disabled="busy"
              class="shrink-0"
              size="xs"
              variant="ghost"
              :label="t('replay.details')"
              @click="showAnalysis(record)" />
          </div>
        </div>
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
