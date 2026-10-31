<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReplayEconomySample } from '@scnexus/app-shared/types/replay-insights.type'
import { economyChart, replayGameTime } from './insights'
import type { EconomyMetric } from './insights'

defineOptions({ name: 'ReplayEconomyChart' })
const props = defineProps<{
  title: string
  samples: ReplayEconomySample[]
  metrics: EconomyMetric[]
}>()
const { t } = useI18n()
const chart = computed(() => economyChart(props.samples, props.metrics))
const hasData = computed(() => chart.value.series.some((series) => series.segments.length))
const colors = ['text-primary', 'text-success', 'text-warning']
</script>

<template>
  <section class="min-w-0 space-y-1">
    <h4 class="font-medium">{{ props.title }}</h4>
    <template v-if="hasData">
      <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs" :aria-label="t('replay.legend')">
        <li v-for="(series, index) in chart.series" :key="series.metric" :class="colors[index]">
          {{ t(`replay.metric.${series.metric}`) }} · {{ index + 1 }}
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
        <g v-for="(series, index) in chart.series" :key="series.metric" :class="colors[index]">
          <g v-for="(segment, segmentIndex) in series.segments" :key="segmentIndex">
            <polyline
              :points="segment.map((point) => `${point.x},${point.y}`).join(' ')"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              :stroke-dasharray="index === 1 ? '6 3' : index === 2 ? '2 3' : undefined" />
            <circle
              v-for="(point, pointIndex) in segment"
              :key="pointIndex"
              :cx="point.x"
              :cy="point.y"
              r="2.5"
              fill="currentColor">
              <title>
                {{ t(`replay.metric.${series.metric}`) }} · {{ replayGameTime(point.gameLoop) }}:
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
