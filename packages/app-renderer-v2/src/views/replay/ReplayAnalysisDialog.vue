<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReplayAnalysis, ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import ReplayEconomyChart from './ReplayEconomyChart.vue'
import { replayPlayerName, replayResultClass, replayProfilePlayer } from './display'
import { replayGameTime } from './insights'

defineOptions({ name: 'ReplayAnalysisDialog' })
const props = defineProps<{
  record: ReplayRecord
  analysis: ReplayAnalysis | null
  loaded: boolean
  busy: boolean
  error: string
}>()
const emit = defineEmits<{ close: []; analyze: []; delete: [] }>()
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
    )} (#${player.playerId})`,
  })),
)
const chartPlayers = computed(() =>
  players.value.map((player, index) => ({
    playerId: player.playerId,
    label: playerItems.value[index]!.label,
    samples: player.economy,
  })),
)
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
      content: 'max-w-3xl max-h-[85vh] sm:max-h-[85vh]',
      description: 'break-all',
      body: 'min-h-0 overflow-y-auto',
      footer: 'flex-wrap',
    }"
    @update:open="!$event && !props.busy && emit('close')">
    <template #body>
      <div class="min-w-0 space-y-3 text-sm">
        <dl class="grid min-w-0 grid-cols-2 gap-3">
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
        <section :aria-label="t('replay.players')">
          <h3 class="text-xs text-muted">{{ t('replay.players') }}</h3>
          <p v-if="!props.record.players.length">{{ t('replay.unknown') }}</p>
          <ul v-else class="space-y-1">
            <li v-for="player in props.record.players" :key="player.slot" class="break-all">
              <span
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
              · {{ t('replay.team') }}: {{ player.team ?? t('replay.unknown') }} ·
              <span :class="replayResultClass(player.result)">
                {{ player.result ? t(`replay.result.${player.result}`) : t('replay.unknown') }}
              </span>
            </li>
          </ul>
        </section>
        <details class="text-xs">
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
        <h3 class="font-medium">{{ t('replay.analysisDetails') }}</h3>
        <p v-if="props.busy" role="status">{{ t('replay.busy') }}</p>
        <p v-if="props.error" role="alert" class="break-words text-error">{{ props.error }}</p>
        <p
          v-else-if="props.loaded && props.analysis && !props.analysis.insights"
          class="text-muted">
          {{
            t(
              props.analysis.status === 'corrupt'
                ? 'replay.analysisCorrupt'
                : 'replay.analysisUnavailable',
            )
          }}
        </p>
        <p v-else-if="props.loaded && !props.analysis?.insights">{{ t('replay.noAnalysis') }}</p>
        <p v-else-if="props.loaded && !players.length" class="text-muted">
          {{ t('replay.noInsights') }}
        </p>
        <p
          v-if="players.length && props.analysis?.capabilities?.tracker.state === 'partial'"
          class="text-warning">
          {{ t('replay.partialInsights') }}
        </p>
        <template v-if="players.length">
          <p class="text-xs text-muted">{{ t('replay.chartNotice') }}</p>
          <ReplayEconomyChart
            :title="t('replay.resources')"
            :players="chartPlayers"
            :metrics="['minerals', 'vespene']" />
          <ReplayEconomyChart
            :title="t('replay.income')"
            :players="chartPlayers"
            :metrics="['mineralIncome', 'vespeneIncome']" />
          <ReplayEconomyChart
            :title="t('replay.workersSupply')"
            :players="chartPlayers"
            :metrics="['workers', 'supplyUsed', 'supplyCap']" />

          <label class="block space-y-1">
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
            <section :aria-label="t('replay.productionTitle')" class="space-y-2">
              <h4 class="font-medium">{{ t('replay.productionTitle') }}</h4>
              <p class="text-xs text-muted">{{ t('replay.productionNotice') }}</p>
              <p v-if="!production.length" class="text-muted">{{ t('replay.noProduction') }}</p>
              <ol v-else class="divide-y divide-default">
                <li
                  v-for="(event, index) in visible"
                  :key="page * size + index"
                  class="grid grid-cols-[3rem_minmax(0,1fr)] gap-2 py-1.5">
                  <span class="text-muted">{{ replayGameTime(event.gameLoop) }}</span>
                  <span class="min-w-0 break-words">
                    {{ t(`replay.production.${event.kind}`) }} · {{ event.name }}
                    <span v-if="event.count !== null">× {{ event.count }}</span>
                  </span>
                </li>
              </ol>
              <div v-if="production.length" class="flex items-center gap-2">
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
            </section>
          </template>
        </template>
      </div>
    </template>
    <template #footer>
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
