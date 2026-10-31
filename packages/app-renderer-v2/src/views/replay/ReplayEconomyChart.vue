<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { comparisonEconomyChart, replayGameTime } from './insights'
import type { EconomyChartPlayer, EconomyMetric } from './insights'

defineOptions({ name: 'ReplayEconomyChart' })
const props = defineProps<{
  title: string
  players: EconomyChartPlayer[]
  metrics: EconomyMetric[]
}>()
const { t } = useI18n()
const chart = computed(() => comparisonEconomyChart(props.players, props.metrics))
const hasData = computed(() => chart.value.series.some((series) => series.segments.length))
</script>

<template>
  <section class="min-w-0 space-y-1">
    <h4 class="font-medium">{{ props.title }}</h4>
    <template v-if="hasData">
      <ul
        class="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs [&>li]:min-w-0 [&>li]:break-all"
        :aria-label="t('replay.legend')">
        <li
          v-for="series in chart.series"
          :key="`${series.playerId}-${series.metric}`"
          :style="{ color: series.color }">
          <svg
            width="24"
            height="10"
            viewBox="0 0 24 10"
            aria-hidden="true"
            class="inline-block shrink-0">
            <path
              d="M0 5 H24"
              stroke="currentColor"
              stroke-width="2"
              :stroke-dasharray="series.dash" />
          </svg>
          {{ series.label }} · {{ t(`replay.metric.${series.metric}`) }}
        </li>
      </ul>
      <svg
        viewBox="0 0 580 182"
        role="img"
        :aria-label="`${props.title}. ${t('replay.chartNotice')}`"
        class="block w-full min-w-0 text-muted">
        <title>{{ props.title }}</title>
        <desc>{{ t('replay.chartNotice') }}</desc>
        <path d="M48 22 V150 H552" fill="none" stroke="currentColor" />
        <g fill="currentColor" font-size="11">
          <text x="42" y="26" text-anchor="end">{{ Math.round(chart.max * 100) / 100 }}</text>
          <text x="42" y="154" text-anchor="end">0</text>
          <text x="48" y="169">0:00</text>
          <text x="300" y="169" text-anchor="middle">{{ replayGameTime(chart.end / 2) }}</text>
          <text x="552" y="169" text-anchor="end">{{ replayGameTime(chart.end) }}</text>
        </g>
        <g
          v-for="series in chart.series"
          :key="`${series.playerId}-${series.metric}`"
          :style="{ color: series.color }">
          <g v-for="(segment, segmentIndex) in series.segments" :key="segmentIndex">
            <polyline
              :points="segment.map((point) => `${point.x},${point.y}`).join(' ')"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              :stroke-dasharray="series.dash" />
            <circle
              v-for="(point, pointIndex) in segment"
              :key="pointIndex"
              :cx="point.x"
              :cy="point.y"
              r="2.5"
              fill="currentColor">
              <title>
                {{ series.label }} · {{ t(`replay.metric.${series.metric}`) }} ·
                {{ replayGameTime(point.gameLoop) }}:
                {{ point.value }}
              </title>
            </circle>
          </g>
        </g>
      </svg>
    </template>
    <p v-else class="text-xs text-muted">{{ t('replay.noSamples') }}</p>
  </section>
</template>
