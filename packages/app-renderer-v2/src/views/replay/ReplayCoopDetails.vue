<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { replayGameTime } from './insights'
import type {
  ReplayCoopAnalysis,
  ReplayCoopSummary,
} from '@scnexus/app-shared/types/replay-coop.type'

defineOptions({ name: 'ReplayCoopDetails' })
const props = defineProps<{
  summary?: ReplayCoopSummary
  analysis?: ReplayCoopAnalysis
  hideUnits?: boolean
}>()
const { t } = useI18n()
const coop = computed(() => props.analysis ?? props.summary)
const metrics = ['level', 'prestige', 'masteryLevel', 'difficulty', 'brutalPlus'] as const
const players = computed(() =>
  (coop.value?.players ?? []).filter(
    (player) =>
      player.commander != null ||
      metrics.some((metric) => player[metric] != null) ||
      player.masteryTalents?.length,
  ),
)
const hasData = computed(
  () =>
    players.value.length ||
    coop.value?.difficulty != null ||
    props.analysis?.timing.observedSeconds != null ||
    props.analysis?.upgrades.events.length ||
    (!props.hideUnits && props.analysis?.units.counts.length),
)
const unitMetrics = ['born', 'started', 'completed', 'died', 'kills'] as const
function value(input: string | number | null | undefined) {
  return input ?? '—'
}
</script>

<template>
  <section
    class="min-w-0 space-y-3 rounded-xl border border-default bg-default p-4"
    :aria-label="t('replay.coop.title')">
    <h3 class="font-medium">{{ t('replay.coop.title') }}</h3>
    <p v-if="!hasData" class="text-xs text-muted">{{ t('replay.analysisFailed') }}</p>
    <template v-else>
      <div class="grid min-w-0 grid-cols-2 gap-3">
        <section
          v-for="player in players"
          :key="player.slotId"
          class="min-w-0 space-y-2 rounded-lg border border-default p-3">
          <h4 class="break-words font-medium">{{ value(player.commander) }}</h4>
          <dl class="grid grid-cols-2 gap-2 text-xs">
            <div v-for="metric in metrics.filter((metric) => player[metric] != null)" :key="metric">
              <dt class="text-muted">{{ t(`replay.coop.${metric}`) }}</dt>
              <dd>{{ value(player[metric]) }}</dd>
            </div>
            <div v-if="player.masteryTalents?.length" class="col-span-2">
              <dt class="text-muted">{{ t('replay.coop.masteryTalents') }}</dt>
              <dd class="break-words">
                {{ player.masteryTalents?.join(' / ') || t('replay.unknown') }}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <dl
        v-if="props.analysis?.timing.observedSeconds != null || coop?.difficulty != null"
        class="grid grid-cols-2 gap-3 text-xs">
        <div v-if="coop?.difficulty != null">
          <dt class="text-muted">{{ t('replay.coop.difficulty') }}</dt>
          <dd>{{ coop.difficulty }}</dd>
        </div>
        <div v-if="props.analysis?.timing.observedSeconds != null">
          <dt class="text-muted">{{ t('replay.coop.observedTime') }}</dt>
          <dd>
            {{
              props.analysis?.timing.observedSeconds == null
                ? t('replay.unknown')
                : t('replay.coop.seconds', { value: props.analysis.timing.observedSeconds })
            }}
          </dd>
        </div>
      </dl>
      <section v-if="props.analysis?.upgrades.events.length" class="space-y-2 text-xs">
        <h4 class="font-medium">{{ t('replay.coop.upgrades') }}</h4>
        <ul class="max-h-48 space-y-2 overflow-auto">
          <li
            v-for="(event, index) in props.analysis.upgrades.events"
            :key="index"
            class="break-words tabular-nums">
            {{ event.upgradeId }} · ×{{ event.count }} · {{ replayGameTime(event.gameLoop) }}
          </li>
        </ul>
      </section>
      <section
        v-if="!props.hideUnits && props.analysis?.units.counts.length"
        class="min-w-0 space-y-2">
        <h4 class="text-sm font-medium">{{ t('replay.coop.units') }}</h4>
        <div v-if="props.analysis?.units.counts.length" class="max-h-64 overflow-auto">
          <table class="w-full table-fixed text-left text-xs">
            <caption class="sr-only">{{ t('replay.coop.units') }}</caption>
            <thead class="sticky top-0 bg-default text-muted">
              <tr>
                <th scope="col" class="w-[30%] py-2">{{ t('replay.coop.unitType') }}</th>
                <th scope="col">{{ t('replay.coop.playerId') }}</th>
                <th v-for="metric in unitMetrics" :key="metric" scope="col" class="text-right">
                  {{ t(`replay.coop.${metric}`) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="unit in props.analysis.units.counts"
                :key="`${unit.playerId}-${unit.unitType}`"
                class="border-t border-default">
                <th scope="row" class="break-words py-2 pr-2 font-normal">{{ unit.unitType }}</th>
                <td>#{{ unit.playerId }}</td>
                <td v-for="metric in unitMetrics" :key="metric" class="text-right tabular-nums">
                  {{ unit[metric] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-xs text-muted">{{ t('replay.coop.noUnits') }}</p>
      </section>
    </template>
  </section>
</template>
