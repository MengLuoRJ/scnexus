<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  ReplayMetrics,
  ReplayPlayerMetrics,
} from '@scnexus/app-shared/types/replay-insights.type'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import { replayPlayerName } from './display'
import { replayGameTime } from './insights'

defineOptions({ name: 'ReplayMetrics' })
const props = defineProps<{ metrics?: ReplayMetrics; record: ReplayRecord }>()
const { t, locale } = useI18n()
const selected = ref(0)
const search = ref('')
const page = ref(0)
const size = 12
const columns = ['initial', 'born', 'started', 'completed', 'lost', 'kills'] as const
const players = computed(() => props.metrics?.players ?? [])
const participant = computed(() => players.value[selected.value])
const hasData = computed(() =>
  players.value.some(
    (player) =>
      player.kills !== null ||
      player.apm.value !== null ||
      player.apm.actions !== null ||
      player.armyValue.some((sample) => sample.minerals !== null || sample.vespene !== null) ||
      player.units.length,
  ),
)
const numberFormat = computed(
  () => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }),
)
function value(input: number | null | undefined) {
  return input == null ? '—' : numberFormat.value.format(input)
}
function label(player: ReplayPlayerMetrics) {
  const matches = props.record.players.filter(
    (item) => player.slot !== null && item.slot === player.slot,
  )
  const name = replayPlayerName(
    player.name ?? (matches.length === 1 ? matches[0]!.name : null),
    t('replay.unknown'),
  )
  return name
}
const items = computed(() =>
  players.value.map((player, index) => ({ value: index, label: label(player) })),
)
const units = computed(() =>
  (participant.value?.units ?? []).filter((unit) =>
    unit.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()),
  ),
)
const visible = computed(() => units.value.slice(page.value * size, (page.value + 1) * size))
const pageCount = computed(() => Math.max(1, Math.ceil(units.value.length / size)))
const army = computed(() => participant.value?.armyValue.at(-1))
watch([selected, search, () => props.metrics], () => {
  page.value = 0
})
watch(players, (players) => {
  if (selected.value >= players.length) selected.value = 0
})
</script>

<template>
  <section
    class="min-w-0 space-y-3 rounded-xl border border-default bg-default p-3"
    :aria-label="t('replay.metrics.title')">
    <h3 class="font-medium">{{ t('replay.metrics.title') }}</h3>
    <p v-if="!hasData" class="text-xs text-muted">{{ t('replay.analysisFailed') }}</p>
    <template v-else>
      <label v-if="players.length" class="block space-y-1">
        <span class="text-xs text-muted">{{ t('replay.metrics.participant') }}</span>
        <USelect
          :model-value="selected"
          :items="items"
          :aria-label="t('replay.metrics.participant')"
          class="w-full min-w-0"
          @update:model-value="selected = Number($event)" />
      </label>
      <div class="grid min-w-0 grid-cols-3 gap-2">
        <section
          class="min-w-0 space-y-1 rounded-lg bg-muted/50 p-3"
          :aria-label="t('replay.metrics.kills')">
          <h4 class="text-xs text-muted">{{ t('replay.metrics.kills') }}</h4>
          <p class="font-semibold tabular-nums">{{ value(participant?.kills) }}</p>
          <p class="text-xs text-muted">
            {{
              t('replay.metrics.killBreakdown', {
                enemy: value(participant?.enemyKills),
                friendly: value(participant?.friendlyKills),
                unknown: value(participant?.unknownKills),
              })
            }}
          </p>
        </section>
        <section
          class="min-w-0 space-y-1 rounded-lg bg-muted/50 p-3"
          :aria-label="t('replay.metrics.apm')">
          <h4 class="text-xs text-muted">{{ t('replay.metrics.apm') }}</h4>
          <p class="font-semibold tabular-nums">{{ value(participant?.apm.value) }}</p>
          <p class="text-xs text-muted">
            {{ t('replay.metrics.actions', { count: value(participant?.apm.actions) }) }}
          </p>
        </section>
        <section
          class="min-w-0 space-y-1 rounded-lg bg-muted/50 p-3"
          :aria-label="t('replay.armyValue')">
          <h4 class="text-xs text-muted">{{ t('replay.armyValue') }}</h4>
          <dl class="text-xs tabular-nums">
            <div>
              <dt class="inline text-muted">{{ t('replay.metric.armyMinerals') }}:</dt>
              <dd class="inline">{{ value(army?.minerals) }}</dd>
            </div>
            <div>
              <dt class="inline text-muted">{{ t('replay.metric.armyVespene') }}:</dt>
              <dd class="inline">{{ value(army?.vespene) }}</dd>
            </div>
          </dl>
          <p v-if="army" class="text-xs text-muted">
            {{ t('replay.metrics.lastSample', { time: replayGameTime(army.gameLoop) }) }}
          </p>
        </section>
      </div>
      <section class="min-w-0 space-y-2" :aria-label="t('replay.metrics.units')">
        <h4 class="text-sm font-medium">{{ t('replay.metrics.units') }}</h4>
        <UInput
          v-if="participant?.units.length"
          v-model="search"
          :aria-label="t('replay.metrics.search')"
          :placeholder="t('replay.metrics.search')"
          class="w-full" />
        <div v-if="visible.length" class="overflow-x-auto">
          <table class="w-full table-fixed text-left text-xs">
            <caption class="sr-only">{{ t('replay.metrics.units') }}</caption>
            <thead class="text-muted">
              <tr>
                <th scope="col" class="w-[30%] py-2 pr-2">{{ t('replay.metrics.unitType') }}</th>
                <th v-for="column in columns" :key="column" scope="col" class="text-right">
                  {{ t(`replay.metrics.${column}`) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="unit in visible" :key="unit.name" class="border-t border-default">
                <th scope="row" class="break-all py-2 pr-2 font-normal" :title="unit.name">
                  {{ unit.name }}
                </th>
                <td v-for="column in columns" :key="column" class="text-right tabular-nums">
                  {{ value(unit[column]) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-xs text-muted">
          {{ t(search.trim() ? 'replay.metrics.noMatches' : 'replay.analysisFailed') }}
        </p>
        <div v-if="units.length" class="flex items-center justify-end gap-3 text-xs tabular-nums">
          <UButton
            size="xs"
            variant="outline"
            :disabled="page === 0"
            :label="t('replay.previous')"
            @click="page--" />
          <span>{{ page + 1 }} / {{ pageCount }}</span>
          <UButton
            size="xs"
            variant="outline"
            :disabled="page + 1 >= pageCount"
            :label="t('replay.next')"
            @click="page++" />
        </div>
      </section>
    </template>
  </section>
</template>
