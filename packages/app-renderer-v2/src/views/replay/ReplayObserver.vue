<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createReplayObserver } from '@scnexus/sc2-observer'
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
const pageSize = 20
const pageCount = computed(() => Math.max(1, Math.ceil(activeUnits.value.length / pageSize)))
const activeUnits = computed(() => state.value?.units.filter((unit) => unit.alive) ?? [])
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
        <p v-if="state.selectedUnitTag" class="break-all text-xs">
          {{ t('replay.observer.selected', { id: state.selectedUnitTag }) }}
        </p>
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
      </template>
    </div>
  </details>
</template>
