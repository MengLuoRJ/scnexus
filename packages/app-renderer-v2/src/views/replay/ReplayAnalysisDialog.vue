<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReplayAnalysis, ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import ReplayScoreCharts from './ReplayScoreCharts.vue'
import ReplayBattleSummary from './ReplayBattleSummary.vue'
import ReplayProductionTiming from './ReplayProductionTiming.vue'
import ReplayMetrics from './ReplayMetrics.vue'
import ReplayCoopDetails from './ReplayCoopDetails.vue'
import ReplayChat from './ReplayChat.vue'
import { replayPlayerName, replayResultClass, replayProfilePlayer } from './display'

defineOptions({ name: 'ReplayAnalysisDialog' })
const props = defineProps<{
  record: ReplayRecord
  analysis: ReplayAnalysis | null
  loaded: boolean
  busy: boolean
  error: string
}>()
const emit = defineEmits<{ close: []; analyze: []; delete: []; watch: [] }>()
const { t, locale } = useI18n()
function localTime(value: string | number | null) {
  return value === null ? t('replay.unknown') : new Date(value).toLocaleString(locale.value)
}
function raceLabel(race: string | null) {
  if (!race) return t('replay.unknown')
  const normalized = race.toLowerCase()
  return ['terran', 'zerg', 'protoss', 'random'].includes(normalized)
    ? t(`replay.race.${normalized}`)
    : race
}
const players = computed(() => props.analysis?.insights?.players ?? [])
const selectedId = ref<number>()
const participant = computed(() =>
  players.value.find((player) => player.playerId === selectedId.value),
)
const playerItems = computed(() =>
  players.value.map((player) => ({
    value: player.playerId,
    label: `${replayPlayerName(
      player.name ??
        props.record.players.find((item) => player.slot !== null && item.slot === player.slot)
          ?.name ??
        null,
      t('replay.participantUnknown', { id: player.playerId }),
    )}`,
  })),
)
const chartPlayers = computed(() =>
  players.value.map((player, index) => ({
    playerId: player.playerId,
    label: playerItems.value[index]!.label,
    samples: player.economy,
  })),
)
const armyPlayers = computed(() => {
  const metrics = props.analysis?.metrics?.players ?? []
  return metrics.length
    ? metrics.map((player, index) => ({
        playerId: player.playerId ?? -(index + 1),
        label: replayPlayerName(
          player.name ??
            props.record.players.find((item) => player.slot !== null && item.slot === player.slot)
              ?.name ??
            null,
          player.playerId !== null
            ? t('replay.participantUnknown', { id: player.playerId })
            : t('replay.metrics.user', { id: player.userId ?? t('replay.unknown') }),
        ),
        samples: player.armyValue.map((sample) => ({
          gameLoop: sample.gameLoop,
          armyMinerals: sample.minerals,
          armyVespene: sample.vespene,
          minerals: null,
          vespene: null,
          mineralIncome: null,
          vespeneIncome: null,
          workers: null,
          supplyUsed: null,
          supplyCap: null,
        })),
      }))
    : chartPlayers.value
})
const page = ref(0)
const size = 20
const production = computed(() =>
  [...(participant.value?.production ?? [])].sort((a, b) => a.gameLoop - b.gameLoop),
)
const visible = computed(() => production.value.slice(page.value * size, (page.value + 1) * size))
const pageCount = computed(() => Math.max(1, Math.ceil(production.value.length / size)))
watch(
  players,
  (value) => {
    if (!value.some((player) => player.playerId === selectedId.value))
      selectedId.value = value[0]?.playerId
  },
  { immediate: true },
)
watch([selectedId, () => props.analysis], () => {
  page.value = 0
})
</script>

<template>
  <UModal
    :open="true"
    :dismissible="!props.busy"
    :title="t('replay.details')"
    :description="props.record.fileName"
    :ui="{
      content: 'w-[calc(100vw-3rem)] max-w-4xl max-h-[90vh] sm:max-h-[90vh]',
      description: 'truncate',
      body: 'min-h-0 overflow-y-auto bg-muted/30',
      footer: 'flex-wrap justify-end',
    }"
    @update:open="!$event && !props.busy && emit('close')">
    <template #body>
      <div class="min-w-0 space-y-4 text-sm">
        <dl
          class="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 rounded-xl border border-default bg-default p-4 [&_dd]:mt-1 [&_dd]:font-medium [&_dd]:tabular-nums">
          <div class="min-w-0">
            <dt class="text-xs text-muted">{{ t('replay.map') }}</dt>
            <dd class="break-words">{{ props.record.mapName ?? t('replay.unknown') }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">{{ t('replay.playedAt') }}</dt>
            <dd>{{ localTime(props.record.playedAt) }}</dd>
          </div>
          <div class="min-w-0">
            <dt class="text-xs text-muted">{{ t('replay.version') }}</dt>
            <dd class="break-words">{{ props.record.gameVersion ?? t('replay.unknown') }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">{{ t('replay.duration') }}</dt>
            <dd>
              {{
                props.record.durationSeconds === null
                  ? t('replay.unknown')
                  : `${Math.floor(props.record.durationSeconds / 60)}:${String(Math.floor(props.record.durationSeconds % 60)).padStart(2, '0')}`
              }}
            </dd>
          </div>
        </dl>
        <section
          class="rounded-xl border border-default bg-default p-4"
          :aria-label="t('replay.players')">
          <h3 class="text-xs text-muted">{{ t('replay.players') }}</h3>
          <p v-if="!props.record.players.length">{{ t('replay.unknown') }}</p>
          <ul v-else class="mt-2 grid grid-cols-2 gap-2">
            <li
              v-for="player in props.record.players"
              :key="player.slot"
              class="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
              <div class="min-w-0">
                <span
                  class="block break-words"
                  :class="{
                    'font-semibold': replayProfilePlayer(props.record)?.slot === player.slot,
                  }">
                  {{
                    t('replay.playerRace', {
                      name: replayPlayerName(player.name, t('replay.unknown')),
                      race: raceLabel(player.race),
                    })
                  }}
                </span>
                <span class="text-xs text-muted">
                  {{ t('replay.team') }}: {{ player.team ?? t('replay.unknown') }}
                </span>
              </div>
              <span
                class="shrink-0 rounded-md border border-current/15 px-2 py-1 text-xs font-medium"
                :class="replayResultClass(player.result)">
                {{ player.result ? t(`replay.result.${player.result}`) : t('replay.unknown') }}
              </span>
            </li>
          </ul>
        </section>
        <details class="rounded-lg border border-default px-4 py-2.5 text-xs">
          <summary class="cursor-pointer text-muted">{{ t('replay.fileInfo') }}</summary>
          <dl class="mt-2 space-y-2">
            <div>
              <dt class="text-muted">{{ t('replay.path') }}</dt>
              <dd class="break-all">{{ props.record.path }}</dd>
            </div>
            <div>
              <dt class="text-muted">{{ t('replay.size') }}</dt>
              <dd>{{ (props.record.sizeBytes / 1024).toFixed(1) }} KiB</dd>
            </div>
            <div>
              <dt class="text-muted">{{ t('replay.modifiedAt') }}</dt>
              <dd>{{ localTime(props.record.mtimeMs) }}</dd>
            </div>
          </dl>
        </details>
        <ReplayCoopDetails
          v-if="
            props.record.category === 'Coop' ||
            props.record.coop?.identification === 'confirmed' ||
            props.analysis?.coop?.identification === 'confirmed'
          "
          :summary="props.record.coop"
          :analysis="props.analysis?.coop"
          :hide-units="!!props.analysis?.metrics" />
        <ReplayMetrics :metrics="props.analysis?.metrics" :record="props.record" />
        <ReplayChat
          v-if="props.loaded"
          :chat="props.analysis?.chat"
          :capability="props.analysis?.capabilities?.message" />
        <h3 class="font-medium">{{ t('replay.analysisDetails') }}</h3>
        <p v-if="props.busy" role="status">{{ t('replay.busy') }}</p>
        <p v-if="props.error" role="alert" class="break-words text-error">
          {{ t('replay.analysisFailed') }}
        </p>
        <template v-if="props.loaded || players.length || props.analysis?.metrics?.players.length">
          <ReplayBattleSummary :players="chartPlayers" />
          <ReplayScoreCharts :players="chartPlayers" :army-players="armyPlayers" />
        </template>
        <section
          v-if="props.loaded || players.length"
          class="space-y-3 rounded-xl border border-default bg-default p-4"
          :aria-label="t('replay.productionTitle')">
          <div class="flex items-center justify-between gap-3">
            <h4 class="font-medium">{{ t('replay.productionTitle') }}</h4>
            <span class="text-xs text-muted">{{ t('replay.timeline.all') }}</span>
          </div>
          <label v-if="players.some((player) => player.production.length)" class="block space-y-1">
            <span class="text-xs text-muted">{{ t('replay.participant') }}</span>
            <USelect
              :model-value="selectedId"
              :items="playerItems"
              :disabled="props.busy"
              :aria-label="t('replay.participant')"
              class="w-full min-w-0"
              @update:model-value="selectedId = Number($event)" />
          </label>
          <template v-if="participant">
            <div class="space-y-3">
              <p v-if="!production.length" class="text-muted">
                {{ t('replay.analysisFailed') }}
              </p>
              <ol v-else class="overflow-hidden rounded-lg border border-default">
                <li
                  v-for="(event, index) in visible"
                  :key="page * size + index"
                  class="grid grid-cols-[10rem_7rem_minmax(0,1fr)_2.5rem] items-start gap-2 px-3 py-2.5 odd:bg-muted/40 hover:bg-elevated/70">
                  <ReplayProductionTiming :event="event" />
                  <span class="rounded-md bg-elevated px-2 py-1 text-center text-xs text-muted">
                    {{ t(`replay.production.${event.kind}`) }}
                  </span>
                  <span class="min-w-0 break-all font-medium">
                    {{ event.name }}
                  </span>
                  <span class="text-right text-xs tabular-nums text-muted">
                    {{ event.count !== null ? `× ${event.count}` : '—' }}
                  </span>
                </li>
              </ol>
              <div
                v-if="production.length"
                class="flex items-center justify-end gap-3 border-t border-default pt-3 text-xs tabular-nums">
                <UButton
                  :disabled="props.busy || page === 0"
                  size="xs"
                  variant="outline"
                  :label="t('replay.previous')"
                  @click="page--" />
                <span>{{ page + 1 }} / {{ pageCount }}</span>
                <UButton
                  :disabled="props.busy || page + 1 >= pageCount"
                  size="xs"
                  variant="outline"
                  :label="t('replay.next')"
                  @click="page++" />
              </div>
            </div>
          </template>
          <p v-else class="text-sm text-muted">{{ t('replay.analysisFailed') }}</p>
        </section>
      </div>
    </template>
    <template #footer>
      <UButton
        :disabled="props.busy"
        icon="i-tabler-player-play"
        :label="t('replay.watch')"
        @click="emit('watch')" />
      <UButton
        :disabled="props.busy"
        color="error"
        variant="outline"
        :label="t('replay.delete')"
        @click="emit('delete')" />
      <UButton
        :disabled="props.busy"
        :label="t(props.analysis ? 'replay.reanalyze' : 'replay.analyze')"
        @click="emit('analyze')" />
      <UButton
        :disabled="props.busy"
        variant="outline"
        :label="t('replay.close')"
        @click="emit('close')" />
    </template>
  </UModal>
</template>
