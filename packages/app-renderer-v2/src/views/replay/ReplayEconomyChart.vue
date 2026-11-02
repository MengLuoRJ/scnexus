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
const { t, locale } = useI18n()
const chart = computed(() => comparisonEconomyChart(props.players, props.metrics))
const hasData = computed(() => chart.value.series.some((series) => series.segments.length))
const ticks = [0, 0.25, 0.5, 0.75, 1]
function valueLabel(value: number) {
  return new Intl.NumberFormat(locale.value, {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value)
}
</script>

<template>
  <section class="min-w-0 overflow-hidden rounded-xl border border-default bg-default p-3">
    <h4 class="mb-3 text-sm font-semibold">{{ props.title }}</h4>
    <template v-if="hasData">
      <ul class="mb-3 grid min-w-0 grid-cols-2 gap-1.5 text-xs" :aria-label="t('replay.legend')">
        <li
          v-for="series in chart.series"
          :key="`${series.playerId}-${series.metric}`"
          class="flex min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5"
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
          <span class="min-w-0 break-words text-default">
            <span class="font-medium">{{ series.label }}</span>
            <span class="text-muted">· {{ t(`replay.metric.${series.metric}`) }}</span>
          </span>
        </li>
      </ul>
      <svg
        viewBox="0 0 580 182"
        role="img"
        :aria-label="`${props.title}. ${t('replay.chartNotice')}`"
        class="block w-full min-w-0 text-muted">
        <title>{{ props.title }}</title>
        <desc>{{ t('replay.chartNotice') }}</desc>
        <rect
          x="48"
          y="22"
          width="504"
          height="128"
          rx="4"
          fill="var(--ui-bg-elevated)"
          fill-opacity="0.4" />
        <g v-for="tick in ticks" :key="tick" class="text-dimmed">
          <path
            :d="`M48 ${150 - tick * 128} H552`"
            fill="none"
            stroke="currentColor"
            stroke-opacity="0.2"
            stroke-dasharray="3 4" />
          <text x="40" :y="154 - tick * 128" text-anchor="end" fill="currentColor" font-size="10">
            {{ valueLabel(chart.max * tick) }}
          </text>
          <text
            :x="48 + tick * 504"
            y="172"
            :text-anchor="tick === 0 ? 'start' : tick === 1 ? 'end' : 'middle'"
            fill="currentColor"
            font-size="10">
            {{ replayGameTime(chart.end * tick) }}
          </text>
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
              stroke-linejoin="round"
              stroke-linecap="round"
              :stroke-dasharray="series.dash" />
            <circle
              v-for="(point, pointIndex) in segment"
              :key="pointIndex"
              :cx="point.x"
              :cy="point.y"
              :r="segment.length === 1 ? 3 : 4"
              :class="segment.length === 1 ? '' : 'opacity-0 hover:opacity-100'"
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
