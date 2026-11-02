<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import { buildReplayStatistics, type ReplayResults } from './statistics'

defineOptions({ name: 'ReplayStatistics' })
const props = defineProps<{ records: ReplayRecord[] }>()
const { t, locale } = useI18n()
const statistics = computed(() => buildReplayStatistics(props.records))
function rate(results: ReplayResults): string {
  return results.winRate === null
    ? t('replay.unknown')
    : new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 1 }).format(
        results.winRate,
      )
}
const sections = computed(() => [
  ...(['commanders', 'difficulties'] as const)
    .filter((key) => statistics.value[key].length)
    .map((key) => ({
      title: t(`replay.statistics.${key}`),
      rows: statistics.value[key].map((row) => ({
        label: row.key ?? t('replay.unknown'),
        results: row.results,
      })),
    })),
  {
    title: t('replay.statistics.maps'),
    rows: statistics.value.maps.map((row) => ({
      label: row.key ?? t('replay.unknown'),
      results: row.results,
    })),
  },
  {
    title: t('replay.statistics.matchups'),
    rows: statistics.value.matchups.map((row) => ({
      label: t(`replay.race.${row.key}`),
      results: row.results,
    })),
  },
  {
    title: t('replay.statistics.months'),
    rows: statistics.value.months.map((row) => ({ label: row.key, results: row.results })),
  },
])
</script>

<template>
  <section class="min-w-0 space-y-4" :aria-label="t('replay.statistics.title')">
    <h2 class="font-semibold">{{ t('replay.statistics.title') }}</h2>
    <p class="text-xs text-muted">{{ t('replay.statistics.notice') }}</p>
    <p v-if="statistics.commanders.length" class="text-xs text-muted">
      {{ t('replay.statistics.coopNotice') }}
    </p>
    <p class="text-xs text-muted">
      {{
        t('replay.statistics.coverage', {
          duplicates: statistics.duplicates,
          missingDates: statistics.missingDates,
        })
      }}
    </p>
    <dl class="grid grid-cols-3 gap-2 rounded-lg border border-default p-3 text-sm">
      <div v-for="metric in ['total', 'wins', 'losses', 'draws', 'unknown'] as const" :key="metric">
        <dt class="text-xs text-muted">{{ t(`replay.statistics.${metric}`) }}</dt>
        <dd>{{ statistics.overall[metric] }}</dd>
      </div>
      <div>
        <dt class="text-xs text-muted">{{ t('replay.statistics.winRate') }}</dt>
        <dd>{{ rate(statistics.overall) }}</dd>
      </div>
    </dl>
    <section v-for="section in sections" :key="section.title" class="min-w-0 space-y-2">
      <h3 class="text-sm font-medium">{{ section.title }}</h3>
      <p v-if="!section.rows.length" class="text-xs text-muted">
        {{ t('replay.statistics.empty') }}
      </p>
      <table v-else class="w-full table-fixed text-left text-xs">
        <caption class="sr-only">{{ section.title }}</caption>
        <thead class="text-muted">
          <tr>
            <th class="w-[30%] py-2" scope="col">{{ t('replay.statistics.group') }}</th>
            <th
              v-for="metric in ['total', 'wins', 'losses', 'draws', 'unknown', 'winRate']"
              :key="metric"
              scope="col"
              class="text-right">
              {{ t(`replay.statistics.${metric}`) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in section.rows" :key="row.label" class="border-t border-default">
            <th scope="row" class="break-words py-2 pr-2 font-normal">{{ row.label }}</th>
            <td
              v-for="metric in ['total', 'wins', 'losses', 'draws', 'unknown'] as const"
              :key="metric"
              class="text-right">
              {{ row.results[metric] }}
            </td>
            <td class="text-right">{{ rate(row.results) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>
