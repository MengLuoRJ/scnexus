<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EconomyChartPlayer } from './insights'
import { replayGameTime } from './insights'
import { buildReplaySummary, summaryMetrics } from './summary'

defineOptions({ name: 'ReplayBattleSummary' })
const props = defineProps<{ players: EconomyChartPlayer[] }>()
const { t, locale } = useI18n()
const summary = computed(() => buildReplaySummary(props.players))
const formatter = computed(() => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }))
function value(input: number | null | undefined) {
  return input == null ? '—' : formatter.value.format(input)
}
</script>

<template>
  <section
    class="min-w-0 space-y-2 rounded-xl border border-default bg-default p-3"
    :aria-label="t('replay.summary.title')">
    <h3 class="font-medium">{{ t('replay.summary.title') }}</h3>
    <p
      v-if="
        !summary.players.some(
          (player) =>
            player.final && Object.values(player.final.values).some((value) => value !== null),
        )
      "
      class="text-xs text-muted">
      {{ t('replay.analysisFailed') }}
    </p>
    <div v-else class="grid min-w-0 grid-cols-2 gap-3">
      <section
        v-for="player in summary.players"
        :key="player.playerId"
        class="min-w-0 rounded-lg bg-muted/40 p-2.5">
        <h4 class="break-words text-sm font-medium">{{ player.label }}</h4>
        <p class="mb-2 text-xs text-muted">
          {{
            player.final
              ? t('replay.metrics.lastSample', { time: replayGameTime(player.final.gameLoop) })
              : '—'
          }}
        </p>
        <dl class="space-y-1 text-xs">
          <div
            v-for="metric in summaryMetrics"
            :key="metric"
            class="flex items-start justify-between gap-2">
            <dt class="min-w-0 text-muted">{{ t(`replay.metric.${metric}`) }}</dt>
            <dd class="shrink-0 tabular-nums">{{ value(player.final?.values[metric]) }}</dd>
          </div>
          <div class="flex items-start justify-between gap-2 border-t border-default pt-1">
            <dt class="text-muted">{{ t('replay.summary.mineralExchange') }}</dt>
            <dd class="shrink-0 tabular-nums">{{ value(player.final?.exchange.minerals) }}</dd>
          </div>
          <div class="flex items-start justify-between gap-2">
            <dt class="text-muted">{{ t('replay.summary.vespeneExchange') }}</dt>
            <dd class="shrink-0 tabular-nums">{{ value(player.final?.exchange.vespene) }}</dd>
          </div>
        </dl>
      </section>
    </div>
  </section>
</template>
