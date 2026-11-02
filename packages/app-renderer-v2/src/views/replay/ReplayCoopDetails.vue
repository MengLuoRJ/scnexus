<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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
const unitMetrics = ['born', 'started', 'completed', 'died', 'kills'] as const
function value(input: string | number | null | undefined) {
  return input ?? t('replay.unknown')
}
</script>

<template>
  <section
    class="min-w-0 space-y-3 rounded-xl border border-default bg-default p-4"
    :aria-label="t('replay.coop.title')">
    <h3 class="font-medium">{{ t('replay.coop.title') }}</h3>
    <p
      class="text-xs"
      :class="coop?.identification === 'confirmed' ? 'text-success' : 'text-warning'">
      {{ t(`replay.coop.identification.${coop?.identification ?? 'unknown'}`) }}
    </p>
    <p class="text-xs text-muted">{{ t('replay.coop.rawNotice') }}</p>
    <div class="grid min-w-0 grid-cols-2 gap-3">
      <section
        v-for="player in coop?.players ?? []"
        :key="player.slotId"
        class="min-w-0 space-y-2 rounded-lg border border-default p-3">
        <h4 class="break-words font-medium">{{ value(player.commander) }}</h4>
        <p class="break-all text-xs text-muted">{{ value(player.profileHandle) }}</p>
        <dl class="grid grid-cols-2 gap-2 text-xs">
          <div v-for="metric in metrics" :key="metric">
            <dt class="text-muted">{{ t(`replay.coop.${metric}`) }}</dt>
            <dd>{{ value(player[metric]) }}</dd>
          </div>
          <div>
            <dt class="text-muted">{{ t('replay.coop.playerId') }}</dt>
            <dd>{{ value(player.playerId) }}</dd>
          </div>
          <div class="col-span-2">
            <dt class="text-muted">{{ t('replay.coop.retryMutationIndexes') }}</dt>
            <dd class="break-words">
              {{ player.retryMutationIndexes?.join(' / ') || t('replay.unknown') }}
            </dd>
          </div>
          <div class="col-span-2">
            <dt class="text-muted">{{ t('replay.coop.masteryTalents') }}</dt>
            <dd class="break-words">
              {{ player.masteryTalents?.join(' / ') || t('replay.unknown') }}
            </dd>
          </div>
        </dl>
      </section>
    </div>
    <p v-if="!coop?.players.length" class="text-xs text-muted">
      {{ t('replay.coop.playersUnknown') }}
    </p>
    <dl class="grid grid-cols-2 gap-3 text-xs">
      <div
        v-for="metric in ['mutators', 'enemyComposition', 'rewards', 'rewardTiming', 'damage']"
        :key="metric">
        <dt class="text-muted">{{ t(`replay.coop.${metric}`) }}</dt>
        <dd v-if="metric === 'mutators' && coop?.mutators.state === 'raw'">
          {{ t('replay.coop.rawIncomplete') }}
        </dd>
        <dd v-else>{{ t('replay.coop.notEstablished') }}</dd>
      </div>
      <div>
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
    <p v-if="coop?.mutators.state === 'raw'" class="break-words text-xs text-muted">
      {{ t('replay.coop.mutatorsRaw') }}: {{ coop.mutators.ids.join(' / ') }}
    </p>
    <details v-if="props.analysis?.upgrades.events.length" class="text-xs">
      <summary class="cursor-pointer text-muted">{{ t('replay.coop.upgrades') }}</summary>
      <p class="mt-2 text-muted">
        {{ t('replay.coop.upgradesNotice') }}
        {{ t(`replay.coop.upgradesState.${props.analysis.upgrades.state}`) }}
      </p>
      <ul class="mt-2 max-h-48 space-y-2 overflow-auto">
        <li
          v-for="(event, index) in props.analysis.upgrades.events"
          :key="index"
          class="break-words border-t border-default pt-2 tabular-nums">
          #{{ event.playerId }} · {{ event.upgradeId }} · ×{{ event.count }} ·
          {{ t('replay.coop.seconds', { value: event.seconds }) }}
        </li>
      </ul>
    </details>
    <p v-else class="text-xs text-muted">{{ t('replay.coop.noUpgrades') }}</p>
    <p v-if="props.analysis?.bonusObjectives.reason" class="break-words text-xs text-muted">
      {{ t('replay.coop.rewardTiming') }}: {{ props.analysis.bonusObjectives.reason }}
    </p>
    <details v-if="props.analysis?.enemyComposition.state === 'raw'" class="text-xs">
      <summary class="cursor-pointer text-muted">{{ t('replay.coop.enemyRaw') }}</summary>
      <dl class="mt-2 grid grid-cols-2 gap-3">
        <div v-for="metric in ['raceIds', 'waveTypeIds'] as const" :key="metric">
          <dt class="text-muted">{{ t(`replay.coop.${metric}`) }}</dt>
          <dd class="break-words">
            {{ props.analysis.enemyComposition[metric].join(' / ') || t('replay.unknown') }}
          </dd>
        </div>
      </dl>
    </details>
    <p v-if="props.hideUnits && props.analysis" class="text-xs text-muted">
      {{ t('replay.coop.units') }}:
      {{ t(`replay.coop.unitsState.${props.analysis.units.state}`) }}
      {{ t('replay.coop.unresolved', { count: props.analysis.units.unresolvedEvents }) }}
    </p>
    <section v-if="!props.hideUnits" class="min-w-0 space-y-2">
      <h4 class="text-sm font-medium">{{ t('replay.coop.units') }}</h4>
      <p class="text-xs text-muted">{{ t('replay.coop.unitsNotice') }}</p>
      <p
        class="text-xs"
        :class="props.analysis?.units.state === 'available' ? 'text-muted' : 'text-warning'">
        {{ t(`replay.coop.unitsState.${props.analysis?.units.state ?? 'unknown'}`) }}
        <span v-if="props.analysis && props.analysis.units.state !== 'unknown'">
          {{ t('replay.coop.unresolved', { count: props.analysis.units.unresolvedEvents }) }}
        </span>
      </p>
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
    <ul v-if="props.analysis?.warnings.length" class="space-y-1 text-xs text-warning">
      <li v-for="warning in props.analysis.warnings" :key="warning" class="break-words">
        {{ warning }}
      </li>
    </ul>
  </section>
</template>
