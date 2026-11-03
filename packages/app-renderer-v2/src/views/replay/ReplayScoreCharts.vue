<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ReplayEconomyChart from './ReplayEconomyChart.vue'
import { scoreChartGroups } from './insights'
import type { EconomyChartPlayer } from './insights'

defineOptions({ name: 'ReplayScoreCharts' })
const props = defineProps<{ players: EconomyChartPlayer[]; armyPlayers?: EconomyChartPlayer[] }>()
const { t } = useI18n()
const active = ref('resources')
const category = ref('army')
const availableGroups = computed(() =>
  scoreChartGroups
    .map((group) => ({
      ...group,
      sections: group.sections.filter((section) => {
        const players =
          group.key === 'armyValue' && section.key === 'army'
            ? (props.armyPlayers ?? props.players)
            : props.players
        return players.some((player) =>
          player.samples.some((sample) =>
            section.metrics.some(
              (metric) => typeof sample[metric] === 'number' && Number.isFinite(sample[metric]),
            ),
          ),
        )
      }),
    }))
    .filter((group) => group.sections.length),
)
const group = computed(
  () => availableGroups.value.find((item) => item.key === active.value) ?? availableGroups.value[0],
)
const selection = computed(
  () =>
    group.value?.sections.find((item) => item.key === category.value) ?? group.value?.sections[0],
)
</script>

<template>
  <section class="min-w-0 space-y-2" :aria-label="t('replay.score.title')">
    <template v-if="!group || !selection">
      <h3 class="font-medium">{{ t('replay.score.title') }}</h3>
      <p class="text-xs text-muted">{{ t('replay.analysisFailed') }}</p>
    </template>
    <template v-else>
      <div
        class="grid grid-cols-3 gap-1 rounded-lg bg-elevated/70 p-1"
        role="group"
        :aria-label="t('replay.score.title')">
        <UButton
          v-for="item in availableGroups"
          :key="item.key"
          :data-score-group="item.key"
          class="min-w-0 justify-center whitespace-normal text-center"
          size="xs"
          :variant="active === item.key ? 'solid' : 'ghost'"
          :color="active === item.key ? 'primary' : 'neutral'"
          :aria-pressed="active === item.key"
          :label="
            t(
              ['resources', 'income', 'workersSupply', 'armyValue'].includes(item.key)
                ? `replay.${item.key}`
                : `replay.score.group.${item.key}`,
            )
          "
          @click="active = item.key" />
      </div>
      <div
        v-if="group.sections.length > 1"
        class="grid grid-cols-3 gap-1"
        role="group"
        :aria-label="t('replay.score.categoryLabel')">
        <UButton
          v-for="item in group.sections"
          :key="item.key"
          :data-score-category="item.key"
          class="min-w-0 justify-center whitespace-normal text-center"
          size="xs"
          :variant="selection.key === item.key ? 'soft' : 'ghost'"
          :aria-pressed="selection.key === item.key"
          :label="t(`replay.score.category.${item.key}`)"
          @click="category = item.key" />
      </div>
      <ReplayEconomyChart
        :key="`${group.key}-${selection.key}`"
        :title="`${t(`replay.score.group.${group.key}`)}${group.sections.length > 1 ? ` · ${t(`replay.score.category.${selection.key}`)}` : ''}`"
        :players="
          group.key === 'armyValue' && selection.key === 'army'
            ? (props.armyPlayers ?? props.players)
            : props.players
        "
        :metrics="selection.metrics" />
    </template>
  </section>
</template>
