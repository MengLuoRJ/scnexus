<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ERRORS } from '@scnexus/app-shared/errors/app.error'
import {
  createAsyncReplayObserver,
  createReplayObserverEventIndex,
  createReplayObserverTimelineSource,
  filterReplayObserverUnits,
} from '@scnexus/sc2-observer'
import type {
  ReplayObserverDataSource,
  ReplayObserverEvent,
  ReplayObserverEventIndex,
  ReplayObserverTimelineSource,
} from '@scnexus/sc2-observer'
import type { ReplayAnalysis } from '@scnexus/app-shared/types/replay.type'
import ReplayObserverAnalysis from './ReplayObserverAnalysis.vue'
import { replayObserverPlayerName } from './display'
import { replayGameTime } from './insights'

defineOptions({ name: 'ReplayObserver' })
const props = defineProps<{
  timeline?: ReplayAnalysis['spatial']
  insights?: ReplayAnalysis['insights']
  trackerPartial?: boolean
  source?: ReplayObserverDataSource
}>()
const { t } = useI18n()
type Observer = ReturnType<typeof createAsyncReplayObserver>
const state = shallowRef<ReturnType<Observer['getState']> | null>(null)
const eventIndex = shallowRef<ReplayObserverEventIndex | null>(null)
let observer: Observer | null = null
let ownedSource: ReplayObserverTimelineSource | null = null
let unsubscribe: (() => void) | undefined
let frame: number | undefined
let activeTick: symbol | undefined
let previousTime: number | undefined
let seekGeneration = 0
let requestedLoop = 0
let requestedUnitTag: string | undefined
const page = ref(0)
const search = ref('')
const player = ref('all')
const life = ref<'alive' | 'dead' | 'all'>('alive')
const eventPage = ref(0)
const eventKind = ref<'all' | ReplayObserverEvent['kind']>('all')
const timeInput = ref('')
const timeInvalid = ref(false)
const loadErrorKey = computed(() => {
  const code = state.value?.error?.sourceCode
  if (
    code === ERRORS.REPLAY_OBSERVER_STALE.code ||
    code === ERRORS.REPLAY_OBSERVER_UNAVAILABLE.code
  )
    return 'replay.observer.refreshAnalysis'
  if (code === ERRORS.REPLAY_OBSERVER_LIMIT.code) return 'replay.observer.windowLimit'
  return 'replay.observer.loadFailed'
})
const eventKinds = ['born', 'init', 'done', 'died', 'type', 'owner'] as const
function playerName(id: number | null) {
  const fallback =
    id === null
      ? t('replay.unknown')
      : id === 0
        ? t('replay.observer.neutral')
        : t('replay.observer.player', { id })
  return replayObserverPlayerName(props.insights?.players ?? [], id, fallback)
}
function jumpToTime() {
  const match = /^(\d{1,6}):([0-5]\d)$/.exec(timeInput.value.trim())
  const loop = match ? (Number(match[1]) * 60 + Number(match[2])) * 16 : NaN
  timeInvalid.value = !Number.isSafeInteger(loop) || loop < 0 || loop > (state.value?.duration ?? 0)
  if (!timeInvalid.value) jumpToAnalysis(loop)
}
function step(seconds: number) {
  jumpToAnalysis(
    Math.max(
      0,
      Math.min(
        state.value?.duration ?? 0,
        (state.value?.requestedGameLoop ?? state.value?.currentGameLoop ?? 0) + seconds * 16,
      ),
    ),
  )
}
const pageSize = 20
const eventPageSize = 10
const playerIds = computed(() =>
  [
    ...new Set(
      props.timeline?.units.flatMap((unit) =>
        unit.observations.map((item) => item.controlPlayerId),
      ) ?? [],
    ),
  ].sort((a, b) => (a ?? -1) - (b ?? -1)),
)
const pageCount = computed(() => Math.max(1, Math.ceil(activeUnits.value.length / pageSize)))
const activeUnits = computed(() =>
  filterReplayObserverUnits(state.value?.units ?? [], {
    search: search.value,
    alive: life.value,
    ...(player.value === 'all'
      ? {}
      : { playerId: player.value === 'unknown' ? null : Number(player.value) }),
  }),
)
const selectedTag = computed(() => state.value?.selectedUnitTag ?? null)
const selectedTrack = computed(() =>
  props.timeline?.units.find((unit) => unit.unitTag === selectedTag.value),
)
const eventFilter = computed(() => ({
  ...(selectedTag.value === null ? {} : { unitTag: selectedTag.value }),
  ...(eventKind.value === 'all' ? {} : { kind: eventKind.value }),
}))
const eventResult = computed(() =>
  eventIndex.value?.query({
    ...eventFilter.value,
    offset: eventPage.value * eventPageSize,
    limit: eventPageSize,
  }),
)
const previousEvent = computed(() =>
  eventIndex.value?.previous(state.value?.currentGameLoop ?? 0, eventFilter.value),
)
const nextEvent = computed(() =>
  eventIndex.value?.next(state.value?.currentGameLoop ?? 0, eventFilter.value),
)
watch(eventKind, () => {
  eventPage.value = 0
})
const eventPageCount = computed(() =>
  Math.max(1, Math.ceil((eventResult.value?.total ?? 0) / eventPageSize)),
)
const visibleEvents = computed(() => eventResult.value?.events ?? [])
watch([search, player, life], () => {
  page.value = 0
})
watch(
  () => state.value?.selectedUnitTag,
  () => {
    eventPage.value = 0
  },
)
async function requestSeek(gameLoop: number, pause = false, unitTag?: string) {
  const current = observer
  if (!current) return
  const request = ++seekGeneration
  requestedLoop = gameLoop
  requestedUnitTag = unitTag
  if (pause) current.pause()
  stopFrame()
  const result = await current.seek(gameLoop)
  if (observer !== current || request !== seekGeneration) return
  if (result.status === 'ready' && unitTag !== undefined) current.selectUnit(unitTag)
}
function jumpToAnalysis(gameLoop: number) {
  return requestSeek(gameLoop, true)
}
function jumpToEvent(unitTag: string, gameLoop: number) {
  return requestSeek(gameLoop, true, unitTag)
}
function selectUnit(unitTag: string | null) {
  seekGeneration++
  requestedUnitTag = undefined
  observer?.selectUnit(unitTag)
}
function cancelLoad() {
  seekGeneration++
  observer?.cancel()
  requestedLoop = state.value?.currentGameLoop ?? 0
  requestedUnitTag = undefined
}
function retryLoad() {
  return requestSeek(requestedLoop, true, requestedUnitTag)
}
const units = computed(
  () => activeUnits.value.slice(page.value * pageSize, (page.value + 1) * pageSize) ?? [],
)
watch(pageCount, (count) => {
  page.value = Math.min(page.value, count - 1)
})
function stopFrame() {
  if (frame !== undefined) cancelAnimationFrame(frame)
  frame = undefined
  activeTick = undefined
  previousTime = undefined
}
function startFrame() {
  if (
    frame === undefined &&
    activeTick === undefined &&
    state.value?.playing &&
    state.value.status === 'ready'
  )
    frame = requestAnimationFrame(tick)
}
async function tick(time: number) {
  frame = undefined
  const current = observer
  if (!current || !state.value?.playing || state.value.status !== 'ready') return
  const token = Symbol()
  activeTick = token
  const delta = previousTime === undefined ? 0 : ((time - previousTime) * 16) / 1000
  previousTime = time
  try {
    await current.advance(delta)
  } finally {
    if (activeTick === token) {
      activeTick = undefined
      if (observer === current) startFrame()
    }
  }
}
function togglePlayback() {
  if (!observer) return
  if (state.value?.playing) {
    observer.pause()
    stopFrame()
  } else {
    observer.play()
    startFrame()
  }
}
function toggleSection(event: Event) {
  if (!(event.target as HTMLDetailsElement).open) {
    observer?.pause()
    stopFrame()
  }
}
function seek(event: Event) {
  return requestSeek(Number((event.target as HTMLInputElement).value))
}
function speed(event: Event) {
  observer?.setSpeed(Number((event.target as HTMLSelectElement).value))
}
function dispose() {
  seekGeneration++
  stopFrame()
  unsubscribe?.()
  unsubscribe = undefined
  observer?.dispose()
  observer = null
  ownedSource?.dispose()
  ownedSource = null
  const previousIndex = eventIndex.value
  eventIndex.value = null
  previousIndex?.dispose()
  state.value = null
}
watch(
  [() => props.timeline, () => props.source],
  ([timeline, source]) => {
    dispose()
    page.value = 0
    eventPage.value = 0
    eventKind.value = 'all'
    timeInput.value = ''
    timeInvalid.value = false
    search.value = ''
    player.value = 'all'
    life.value = 'alive'
    if (!timeline) return
    ownedSource = source ? null : createReplayObserverTimelineSource(timeline)
    observer = createAsyncReplayObserver(source ?? ownedSource!)
    eventIndex.value = createReplayObserverEventIndex(timeline)
    state.value = observer.getState()
    unsubscribe = observer.subscribe((value) => {
      state.value = value
      if (value.requestedGameLoop !== null) requestedLoop = value.requestedGameLoop
      if (value.status !== 'ready' || !value.playing) stopFrame()
      else startFrame()
    })
    requestedLoop = 0
    requestedUnitTag = undefined
    void requestSeek(0)
  },
  { immediate: true },
)
onBeforeUnmount(dispose)
</script>

<template>
  <details class="min-w-0 rounded-xl border border-default bg-default p-4" @toggle="toggleSection">
    <summary class="cursor-pointer font-medium">{{ t('replay.observer.title') }}</summary>
    <div class="mt-3 space-y-3 text-sm">
      <p class="text-xs text-muted">{{ t('replay.observer.notice') }}</p>
      <p v-if="!state">{{ t('replay.observer.missing') }}</p>
      <template v-else>
        <p v-if="props.timeline?.partial" class="text-warning">
          {{ t('replay.observer.partial') }}
        </p>
        <div
          v-if="state.status === 'loading'"
          role="status"
          aria-live="polite"
          class="flex flex-wrap items-center gap-2 rounded border border-default p-2 text-xs">
          <span>
            {{
              t('replay.observer.loadingFrame', {
                time: replayGameTime(state.requestedGameLoop ?? 0),
              })
            }}
          </span>
          <UButton size="xs" color="neutral" variant="soft" class="ml-auto" @click="cancelLoad">
            {{ t('replay.observer.cancelLoad') }}
          </UButton>
        </div>
        <div
          v-else-if="state.status === 'error'"
          role="alert"
          class="flex flex-wrap items-center gap-2 rounded border border-warning p-2 text-xs">
          <span>{{ t(loadErrorKey) }}</span>
          <UButton
            v-if="loadErrorKey === 'replay.observer.loadFailed'"
            size="xs"
            color="neutral"
            variant="soft"
            class="ml-auto"
            @click="retryLoad">
            {{ t('replay.observer.retryLoad') }}
          </UButton>
        </div>
        <div
          v-else-if="state.status === 'idle'"
          role="status"
          class="flex flex-wrap items-center gap-2 text-xs">
          <span>{{ t('replay.observer.notLoaded') }}</span>
          <UButton size="xs" color="neutral" variant="soft" class="ml-auto" @click="retryLoad">
            {{ t('replay.observer.loadFrame') }}
          </UButton>
        </div>
        <div class="flex items-center gap-3">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            :disabled="state.status === 'idle' || state.status === 'error'"
            @click="togglePlayback">
            {{ t(state.playing ? 'replay.observer.pause' : 'replay.observer.play') }}
          </UButton>
          <label class="flex items-center gap-2 text-xs">
            {{ t('replay.observer.speed') }}
            <select
              :value="state.speed"
              class="rounded border border-default bg-default p-1"
              @change="speed">
              <option v-for="value in [0.5, 1, 2, 4]" :key="value" :value="value">
                {{ value }}×
              </option>
            </select>
          </label>
          <span v-if="state.availableRange" class="ml-auto text-xs tabular-nums">
            {{ t('replay.observer.count', { count: activeUnits.length }) }}
          </span>
        </div>
        <p class="text-xs tabular-nums">
          {{ t('replay.observer.gameTime') }}: {{ replayGameTime(state.currentGameLoop) }} /
          {{ replayGameTime(state.duration) }}
        </p>
        <label class="block text-xs">
          {{ t('replay.observer.loop') }}: {{ Math.floor(state.currentGameLoop) }} /
          {{ state.duration }}
          <input
            type="range"
            min="0"
            :max="state.duration"
            step="1"
            :value="state.requestedGameLoop ?? state.currentGameLoop"
            class="mt-2 block w-full accent-current"
            @input="seek" />
        </label>
        <div class="flex flex-wrap items-end gap-2">
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            :disabled="state.currentGameLoop === 0"
            @click="jumpToAnalysis(0)">
            {{ t('replay.observer.restart') }}
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            :disabled="state.currentGameLoop === 0"
            @click="step(-5)">
            {{ t('replay.observer.backFive') }}
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            :disabled="state.currentGameLoop >= state.duration"
            @click="step(5)">
            {{ t('replay.observer.forwardFive') }}
          </UButton>
          <form class="ml-auto flex items-end gap-2" @submit.prevent="jumpToTime">
            <label class="text-xs">
              {{ t('replay.observer.timeInput') }}
              <input
                v-model="timeInput"
                type="text"
                inputmode="text"
                maxlength="9"
                placeholder="m:ss"
                :aria-label="t('replay.observer.timeInput')"
                :aria-invalid="timeInvalid"
                class="mt-1 block w-24 rounded border border-default bg-default px-2 py-1.5"
                @input="timeInvalid = false" />
            </label>
            <UButton type="submit" size="xs" color="neutral" variant="soft">
              {{ t('replay.observer.seekTime') }}
            </UButton>
          </form>
        </div>
        <p v-if="timeInvalid" role="alert" class="text-xs text-error">
          {{ t('replay.observer.invalidTime', { end: replayGameTime(state.duration) }) }}
        </p>
        <ReplayObserverAnalysis
          v-if="state.availableRange"
          :insights="props.insights"
          :units="state.units"
          :game-loop="Math.floor(state.currentGameLoop)"
          :partial="props.trackerPartial || props.timeline?.partial"
          :timeline="props.timeline"
          @seek="jumpToAnalysis"
          @select-event="jumpToEvent" />
        <div class="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <label class="min-w-0 text-xs">
            {{ t('replay.observer.search') }}
            <UInput
              v-model="search"
              :aria-label="t('replay.observer.search')"
              class="mt-1 w-full" />
          </label>
          <label class="min-w-0 text-xs">
            {{ t('replay.observer.owner') }}
            <select
              v-model="player"
              :aria-label="t('replay.observer.owner')"
              class="mt-1 w-full rounded border border-default bg-default p-1.5">
              <option value="all">{{ t('replay.observer.allPlayers') }}</option>
              <option
                v-for="id in playerIds"
                :key="id ?? 'unknown'"
                :value="id === null ? 'unknown' : String(id)">
                {{ playerName(id) }}
              </option>
            </select>
          </label>
          <label class="min-w-0 text-xs">
            {{ t('replay.observer.life') }}
            <select
              v-model="life"
              :aria-label="t('replay.observer.life')"
              class="mt-1 w-full rounded border border-default bg-default p-1.5">
              <option v-for="value in ['alive', 'dead', 'all']" :key="value" :value="value">
                {{ t(`replay.observer.${value}`) }}
              </option>
            </select>
          </label>
        </div>
        <section
          v-if="selectedTrack"
          class="rounded-lg border border-default p-3 text-xs"
          :aria-label="t('replay.observer.details')">
          <div class="flex items-center justify-between gap-2">
            <h4 class="break-all font-medium">
              {{ t('replay.observer.selected', { id: state.selectedUnitTag }) }}
            </h4>
            <UButton size="xs" color="neutral" variant="ghost" @click="selectUnit(null)">
              {{ t('replay.observer.clearSelection') }}
            </UButton>
          </div>
          <p v-if="!state.selectedUnit" class="mt-2 text-muted">
            {{ t('replay.observer.notBorn') }}
          </p>
          <dl v-else class="mt-2 grid grid-cols-2 gap-2 break-words">
            <div>
              {{ t('replay.observer.unit') }}:
              {{ state.selectedUnit.unitType ?? t('replay.unknown') }}
            </div>
            <div>
              {{ t('replay.observer.life') }}:
              {{ t(state.selectedUnit.alive ? 'replay.observer.alive' : 'replay.observer.dead') }}
            </div>
            <div>
              {{ t('replay.observer.owner') }}:
              {{ playerName(state.selectedUnit.controlPlayerId) }}
            </div>
            <div>
              {{ t('replay.observer.completed') }}:
              {{ t(state.selectedUnit.completed ? 'replay.observer.yes' : 'replay.observer.no') }}
            </div>
            <div>
              {{ t('replay.observer.position') }}:
              {{
                state.selectedUnit.position
                  ? `${state.selectedUnit.position.x}, ${state.selectedUnit.position.y}`
                  : t('replay.unknown')
              }}
            </div>
            <div>
              {{ t('replay.observer.age') }}:
              {{
                state.selectedUnit.position
                  ? Math.floor(state.selectedUnit.position.ageGameLoops)
                  : t('replay.unknown')
              }}
            </div>
          </dl>
          <div class="mt-2 flex gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              @click="jumpToEvent(selectedTrack.unitTag, selectedTrack.startedGameLoop)">
              {{ t('replay.observer.jumpStart') }}
            </UButton>
            <UButton
              v-if="selectedTrack.diedGameLoop !== null"
              size="xs"
              color="neutral"
              variant="soft"
              @click="jumpToEvent(selectedTrack.unitTag, selectedTrack.diedGameLoop)">
              {{ t('replay.observer.jumpDeath') }}
            </UButton>
          </div>
        </section>
        <div class="max-h-64 overflow-auto">
          <table class="w-full table-fixed text-left text-xs">
            <thead class="sticky top-0 bg-default text-muted">
              <tr>
                <th class="w-[32%] py-2">{{ t('replay.observer.unit') }}</th>
                <th class="w-[22%]">{{ t('replay.observer.owner') }}</th>
                <th class="w-[25%]">{{ t('replay.observer.position') }}</th>
                <th>{{ t('replay.observer.age') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="unit in units" :key="unit.unitTag" class="border-t border-default">
                <td class="break-words py-2 pr-2">
                  <button
                    class="text-left hover:underline"
                    :aria-pressed="state.selectedUnitTag === unit.unitTag"
                    @click="selectUnit(unit.unitTag)">
                    {{ unit.unitType ?? t('replay.unknown') }}
                    <span class="text-muted">#{{ unit.unitTag }}</span>
                    <span v-if="!unit.completed" class="block text-muted">
                      {{ t('replay.observer.building') }}
                    </span>
                  </button>
                </td>
                <td class="break-words pr-2">{{ playerName(unit.controlPlayerId) }}</td>
                <td>
                  {{
                    unit.position ? `${unit.position.x}, ${unit.position.y}` : t('replay.unknown')
                  }}
                </td>
                <td>
                  {{
                    unit.position
                      ? Math.floor(state.currentGameLoop - unit.position.observedGameLoop)
                      : t('replay.unknown')
                  }}
                </td>
              </tr>
              <tr v-if="!units.length">
                <td colspan="4" class="py-3 text-muted">
                  {{
                    t(state.availableRange ? 'replay.observer.empty' : 'replay.observer.notLoaded')
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-2">
          <UButton size="xs" color="neutral" variant="ghost" :disabled="page === 0" @click="page--">
            {{ t('replay.observer.previous') }}
          </UButton>
          <span class="text-xs text-muted">
            {{ t('replay.observer.page', { page: page + 1, pages: pageCount }) }}
          </span>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="page + 1 >= pageCount"
            @click="page++">
            {{ t('replay.observer.next') }}
          </UButton>
        </div>
        <section class="border-t border-default pt-3" :aria-label="t('replay.observer.events')">
          <div class="flex flex-wrap items-center gap-2">
            <h4 class="text-xs font-medium">{{ t('replay.observer.events') }}</h4>
            <label class="ml-auto text-xs">
              {{ t('replay.observer.eventType') }}
              <select
                v-model="eventKind"
                :aria-label="t('replay.observer.eventType')"
                class="ml-2 rounded border border-default bg-default p-1.5">
                <option value="all">{{ t('replay.observer.allEventTypes') }}</option>
                <option v-for="kind in eventKinds" :key="kind" :value="kind">
                  {{ t(`replay.observer.event.${kind}`) }}
                </option>
              </select>
            </label>
          </div>
          <div class="mt-2 flex gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              :disabled="!previousEvent"
              @click="previousEvent && jumpToAnalysis(previousEvent.gameLoop)">
              {{ t('replay.observer.previousEvent') }}
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              :disabled="!nextEvent"
              @click="nextEvent && jumpToAnalysis(nextEvent.gameLoop)">
              {{ t('replay.observer.nextEvent') }}
            </UButton>
          </div>
          <p class="mt-1 text-xs text-muted">
            {{
              t(state.selectedUnitTag ? 'replay.observer.unitEvents' : 'replay.observer.allEvents')
            }}
          </p>
          <ul class="mt-2 max-h-40 overflow-y-auto text-xs">
            <li
              v-for="(event, index) in visibleEvents"
              :key="`${event.unitTag}-${event.gameLoop}-${event.kind}-${index}`">
              <button
                class="w-full break-words rounded px-2 py-1.5 text-left hover:bg-muted"
                @click="jumpToEvent(event.unitTag, event.gameLoop)">
                {{ replayGameTime(event.gameLoop) }} ({{ event.gameLoop }}) ·
                {{ t(`replay.observer.event.${event.kind}`) }} · #{{ event.unitTag }}
              </button>
            </li>
          </ul>
          <p v-if="!eventResult?.total" class="mt-2 text-xs text-muted">
            {{ t('replay.observer.noEvents') }}
          </p>
          <div v-if="eventPageCount > 1" class="mt-2 flex items-center justify-between gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="eventPage === 0"
              @click="eventPage--">
              {{ t('replay.observer.previous') }}
            </UButton>
            <span class="text-xs text-muted">
              {{ t('replay.observer.page', { page: eventPage + 1, pages: eventPageCount }) }}
            </span>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="eventPage + 1 >= eventPageCount"
              @click="eventPage++">
              {{ t('replay.observer.next') }}
            </UButton>
          </div>
        </section>
      </template>
    </div>
  </details>
</template>
