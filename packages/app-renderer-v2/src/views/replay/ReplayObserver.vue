<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createReplayObserver,
  filterReplayObserverUnits,
  queryReplayObserverEvents,
} from '@scnexus/sc2-observer'
import type { ReplayAnalysis } from '@scnexus/app-shared/types/replay.type'

defineOptions({ name: 'ReplayObserver' })
const props = defineProps<{ timeline: ReplayAnalysis['spatial'] }>()
const { t } = useI18n()
type Observer = ReturnType<typeof createReplayObserver>
const state = shallowRef<ReturnType<Observer['getState']> | null>(null)
let observer: Observer | null = null
let unsubscribe: (() => void) | undefined
let frame: number | undefined
let previousTime: number | undefined
const page = ref(0)
const search = ref('')
const player = ref('all')
const life = ref<'alive' | 'dead' | 'all'>('alive')
const eventPage = ref(0)
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
const events = computed(() =>
  props.timeline ? queryReplayObserverEvents(props.timeline, selectedTag.value ?? undefined) : [],
)
const eventPageCount = computed(() => Math.max(1, Math.ceil(events.value.length / eventPageSize)))
const visibleEvents = computed(() =>
  events.value.slice(eventPage.value * eventPageSize, (eventPage.value + 1) * eventPageSize),
)
watch([search, player, life], () => {
  page.value = 0
})
watch(
  () => state.value?.selectedUnitTag,
  () => {
    eventPage.value = 0
  },
)
function jumpToEvent(unitTag: string, gameLoop: number) {
  observer?.pause()
  stopFrame()
  observer?.seek(gameLoop)
  observer?.selectUnit(unitTag)
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
  previousTime = undefined
}
function tick(time: number) {
  frame = undefined
  if (!observer || !state.value?.playing) return
  if (previousTime !== undefined) observer.advance(((time - previousTime) * 16) / 1000)
  previousTime = time
  if (state.value?.playing) frame = requestAnimationFrame(tick)
  else previousTime = undefined
}
function togglePlayback() {
  if (!observer) return
  if (state.value?.playing) {
    observer.pause()
    stopFrame()
  } else {
    observer.play()
    if (frame === undefined && state.value?.playing) frame = requestAnimationFrame(tick)
  }
}
function toggleSection(event: Event) {
  if (!(event.target as HTMLDetailsElement).open) {
    observer?.pause()
    stopFrame()
  }
}
function seek(event: Event) {
  observer?.seek(Number((event.target as HTMLInputElement).value))
  previousTime = undefined
}
function speed(event: Event) {
  observer?.setSpeed(Number((event.target as HTMLSelectElement).value))
}
function dispose() {
  stopFrame()
  unsubscribe?.()
  unsubscribe = undefined
  observer?.dispose()
  observer = null
  state.value = null
}
watch(
  () => props.timeline,
  (timeline) => {
    dispose()
    page.value = 0
    eventPage.value = 0
    search.value = ''
    player.value = 'all'
    life.value = 'alive'
    if (!timeline) return
    observer = createReplayObserver(timeline)
    state.value = observer.getState()
    unsubscribe = observer.subscribe((value) => {
      state.value = value
    })
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
        <div class="flex items-center gap-3">
          <UButton size="sm" color="neutral" variant="soft" @click="togglePlayback">
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
          <span class="ml-auto text-xs tabular-nums">
            {{ t('replay.observer.count', { count: activeUnits.length }) }}
          </span>
        </div>
        <label class="block text-xs">
          {{ t('replay.observer.loop') }}: {{ Math.floor(state.currentGameLoop) }} /
          {{ state.duration }}
          <input
            type="range"
            min="0"
            :max="state.duration"
            step="1"
            :value="state.currentGameLoop"
            class="mt-2 block w-full accent-current"
            @input="seek" />
        </label>
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
                {{
                  id === null
                    ? t('replay.unknown')
                    : id === 0
                      ? t('replay.observer.neutral')
                      : t('replay.observer.player', { id })
                }}
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
            <UButton size="xs" color="neutral" variant="ghost" @click="observer?.selectUnit(null)">
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
              {{ state.selectedUnit.controlPlayerId ?? t('replay.unknown') }}
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
                <th class="w-[40%] py-2">{{ t('replay.observer.unit') }}</th>
                <th class="w-[12%]">{{ t('replay.observer.owner') }}</th>
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
                    @click="observer?.selectUnit(unit.unitTag)">
                    {{ unit.unitType ?? t('replay.unknown') }}
                    <span class="text-muted">#{{ unit.unitTag }}</span>
                    <span v-if="!unit.completed" class="block text-muted">
                      {{ t('replay.observer.building') }}
                    </span>
                  </button>
                </td>
                <td>{{ unit.controlPlayerId ?? t('replay.unknown') }}</td>
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
                <td colspan="4" class="py-3 text-muted">{{ t('replay.observer.empty') }}</td>
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
          <h4 class="text-xs font-medium">{{ t('replay.observer.events') }}</h4>
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
                {{ event.gameLoop }} · {{ t(`replay.observer.event.${event.kind}`) }} · #{{
                  event.unitTag
                }}
              </button>
            </li>
          </ul>
          <p v-if="!events.length" class="mt-2 text-xs text-muted">
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
