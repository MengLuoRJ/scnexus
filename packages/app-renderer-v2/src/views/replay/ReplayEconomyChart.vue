<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'vccs'
import { comparisonEconomyChart, replayGameTime } from './insights'
import type { EconomyChartPlayer, EconomyMetric } from './insights'

defineOptions({ name: 'ReplayEconomyChart' })
const props = defineProps<{
  title: string
  players: EconomyChartPlayer[]
  metrics: EconomyMetric[]
}>()
const { t, locale } = useI18n()
const hidden = ref<string[]>([])
const chart = computed(() => comparisonEconomyChart(props.players, props.metrics))
const series = computed(() =>
  chart.value.series.map((item) => ({
    ...item,
    key: `${item.playerId}-${item.metric}`,
    name: `${item.label} · ${t(`replay.metric.${item.metric}`)}`,
    isolated: new Set(
      item.segments.filter((segment) => segment.length === 1).map(([point]) => point!.gameLoop),
    ),
  })),
)
const hasData = computed(() => series.value.some((item) => item.segments.length))
const timeline = computed(() =>
  [...new Set(series.value.flatMap((item) => item.data.map((point) => point.gameLoop)))]
    .sort((a, b) => a - b)
    .map((gameLoop) => ({ gameLoop })),
)
const numberFormat = computed(() => new Intl.NumberFormat(locale.value))
const axisFormat = computed(
  () => new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }),
)
function toggleSeries(key: string) {
  hidden.value = hidden.value.includes(key)
    ? hidden.value.filter((item) => item !== key)
    : [...hidden.value, key]
}
function tooltipRows(label: string | number | undefined) {
  const gameLoop = Number(label)
  // Independent player histories must never be matched by array index or interpolated.
  return series.value.flatMap((item) =>
    hidden.value.includes(item.key)
      ? []
      : item.data
          .filter((point) => point.gameLoop === gameLoop && point.value !== null)
          .map((point) => ({ ...item, value: point.value! })),
  )
}
</script>

<template>
  <section class="min-w-0 overflow-hidden rounded-xl border border-default bg-default p-3">
    <h4 class="mb-3 text-sm font-semibold">{{ props.title }}</h4>
    <template v-if="hasData">
      <ul class="mb-2 grid min-w-0 grid-cols-2 gap-1.5 text-xs" :aria-label="t('replay.legend')">
        <li v-for="item in series" :key="item.key" class="min-w-0">
          <button
            type="button"
            class="flex w-full min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-left transition-opacity hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
            :class="{ 'opacity-40': hidden.includes(item.key) }"
            :aria-pressed="!hidden.includes(item.key)"
            :aria-label="item.name"
            :style="{ color: item.color }"
            @click="toggleSeries(item.key)">
            <svg width="24" height="10" viewBox="0 0 24 10" aria-hidden="true" class="shrink-0">
              <path
                d="M0 5 H24"
                stroke="currentColor"
                stroke-width="2"
                :stroke-dasharray="item.dash" />
            </svg>
            <span class="min-w-0 break-words text-default">
              <span class="font-medium">{{ item.label }}</span>
              <span class="text-muted">· {{ t(`replay.metric.${item.metric}`) }}</span>
            </span>
          </button>
        </li>
      </ul>
      <LineChart
        :data="timeline"
        :height="220"
        :title="props.title"
        :desc="props.title"
        :margin="{ top: 12, right: 16, bottom: 0, left: 0 }"
        :transition="{ duration: 0.25 }"
        class="economy-chart w-full min-w-0 text-xs">
        <CartesianGrid :vertical="false" stroke="var(--ui-border)" stroke-dasharray="3 4" />
        <XAxis
          data-key="gameLoop"
          type="number"
          :allow-duplicated-category="false"
          :domain="[0, chart.end]"
          :tick-formatter="(value: unknown) => replayGameTime(Number(value))"
          :tick="{ fill: 'var(--ui-text-muted)', 'font-size': 11 }"
          :axis-line="false"
          :tick-line="false"
          :min-tick-gap="28" />
        <YAxis
          :domain="[chart.min, chart.max]"
          :width="48"
          :tick-count="5"
          :tick-formatter="(value: unknown) => axisFormat.format(Number(value))"
          :tick="{ fill: 'var(--ui-text-muted)', 'font-size': 11 }"
          :axis-line="false"
          :tick-line="false" />
        <!-- Exact-time filtering below replaces vccs' index-based null filtering for independent histories. -->
        <Tooltip
          :filter-null="false"
          :is-animation-active="false"
          :cursor="{ stroke: 'var(--ui-text-dimmed)', strokeDasharray: '3 3' }">
          <template #content="{ active, label }">
            <div
              v-if="active && tooltipRows(label).length"
              class="max-w-72 rounded-lg border border-default bg-elevated p-3 text-xs shadow-lg">
              <p class="mb-2 font-semibold tabular-nums">{{ replayGameTime(Number(label)) }}</p>
              <ul class="space-y-1.5">
                <li
                  v-for="(row, index) in tooltipRows(label)"
                  :key="`${row.key}-${index}`"
                  class="flex items-center gap-2">
                  <span class="size-2 shrink-0 rounded-full" :style="{ background: row.color }" />
                  <span class="min-w-0 break-words text-muted">{{ row.name }}</span>
                  <span class="ml-auto shrink-0 font-medium tabular-nums">
                    {{ numberFormat.format(row.value) }}
                  </span>
                </li>
              </ul>
            </div>
          </template>
        </Tooltip>
        <Line
          v-for="item in series"
          :key="item.key"
          :data="item.data"
          data-key="value"
          :name="item.name"
          type="linear"
          :stroke="item.color"
          :stroke-width="2"
          :stroke-dasharray="item.dash"
          :hide="hidden.includes(item.key)"
          :connect-nulls="false"
          :active-dot="false">
          <template #dot="{ cx, cy, index }">
            <circle
              v-if="
                item.isolated.has(item.data[index]!.gameLoop) && item.data[index]!.value !== null
              "
              :cx="cx"
              :cy="cy"
              r="3"
              :fill="item.color">
              <title>
                {{ item.name }} · {{ replayGameTime(item.data[index]!.gameLoop) }}:
                {{ numberFormat.format(item.data[index]!.value!) }}
              </title>
            </circle>
          </template>
        </Line>
      </LineChart>
      <p class="mt-1 text-xs text-muted">{{ t('replay.chartHint') }}</p>
    </template>
    <p v-else class="text-xs text-muted">{{ t('replay.analysisFailed') }}</p>
  </section>
</template>
