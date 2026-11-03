<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import type { ReplayProductionEvent } from '@scnexus/app-shared/types/replay-insights.type'
import { replayGameTime } from './insights'

defineOptions({ name: 'ReplayProductionTiming' })
const { t } = useI18n()
const props = defineProps<{ event: ReplayProductionEvent }>()
function time(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? replayGameTime(value)
    : '—'
}
</script>

<template>
  <div class="min-w-0 space-y-1 text-xs text-muted">
    <template v-if="props.event.timingBasis">
      <dl class="grid grid-cols-[auto_1fr] gap-x-2 tabular-nums">
        <dt>{{ t('replay.productionTiming.start') }}</dt>
        <dd>{{ time(props.event.startGameLoop) }}</dd>
        <dt>{{ t('replay.productionTiming.end') }}</dt>
        <dd>{{ time(props.event.endGameLoop) }}</dd>
      </dl>
    </template>
    <template v-else>
      <span class="font-mono tabular-nums">{{ time(props.event.gameLoop) }}</span>
    </template>
  </div>
</template>
