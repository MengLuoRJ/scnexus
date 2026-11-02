<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReplayAnalysis } from '@scnexus/app-shared/types/replay.type'
import { replayGameTime } from './insights'

defineOptions({ name: 'ReplayCommandTimeline' })
const props = defineProps<{ analysis: ReplayAnalysis | null; busy: boolean }>()
const { t } = useI18n()
const userId = ref<number>()
const page = ref(0)
const size = 20
const users = computed(() =>
  [...new Set((props.analysis?.commands ?? []).map((event) => event.userId))].sort((a, b) => a - b),
)
const items = computed(() =>
  users.value.map((id) => ({ value: id, label: t('replay.commands.user', { id }) })),
)
const events = computed(() =>
  (props.analysis?.commands ?? [])
    .filter((event) => event.userId === userId.value)
    .sort((a, b) => a.gameLoop - b.gameLoop),
)
const visible = computed(() => events.value.slice(page.value * size, (page.value + 1) * size))
const pageCount = computed(() => Math.max(1, Math.ceil(events.value.length / size)))
watch(
  users,
  (value) => {
    if (!value.includes(userId.value!)) userId.value = value[0]
  },
  { immediate: true },
)
watch([userId, () => props.analysis], () => {
  page.value = 0
})
const unverified = computed(
  () => props.analysis?.capabilities?.game?.compatibility?.state === 'unverified',
)
const available = computed(() => {
  const game = props.analysis?.capabilities?.game
  return game?.state === 'available' || (game?.state === 'partial' && unverified.value)
})
</script>

<template>
  <div class="space-y-3">
    <p class="rounded-lg bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
      {{ t('replay.commands.notice') }}
    </p>
    <p v-if="!available" class="text-sm text-muted" role="status">
      {{ t(`replay.commands.${props.analysis?.capabilities?.game?.state ?? 'missing'}`) }}
    </p>
    <template v-else>
      <p
        v-if="unverified"
        role="status"
        class="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
        {{
          t('replay.commands.unverified', {
            source: props.analysis?.baseBuild,
            decoder: props.analysis?.capabilities?.game?.compatibility?.protocolBuild,
          })
        }}
      </p>
      <USelect
        v-if="items.length"
        :model-value="userId"
        :items="items"
        :disabled="props.busy"
        :aria-label="t('replay.commands.participant')"
        class="w-full"
        @update:model-value="userId = Number($event)" />
      <p v-if="!events.length" class="text-sm text-muted">{{ t('replay.commands.empty') }}</p>
      <ol v-else class="overflow-hidden rounded-lg border border-default">
        <li
          v-for="(event, index) in visible"
          :key="page * size + index"
          class="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-3 px-3 py-2.5 text-sm odd:bg-muted/40 hover:bg-elevated/70">
          <span class="font-mono text-xs tabular-nums text-muted">
            {{ replayGameTime(event.gameLoop) }}
          </span>
          <div class="min-w-0 space-y-1">
            <p class="break-words font-medium">
              {{
                event.abilityLink === null
                  ? t('replay.commands.noAbility')
                  : t('replay.commands.ability', {
                      link: event.abilityLink,
                      index: event.abilityIndex,
                    })
              }}
            </p>
            <p class="text-xs text-muted">
              {{ t('replay.commands.flags', { flags: event.flags }) }}
            </p>
          </div>
        </li>
      </ol>
      <div v-if="events.length" class="flex items-center justify-end gap-3 text-xs tabular-nums">
        <UButton
          :disabled="props.busy || page === 0"
          size="xs"
          variant="outline"
          :label="t('replay.previous')"
          @click="page--" />
        <span>{{ page + 1 }} / {{ pageCount }}</span>
        <UButton
          :disabled="props.busy || page + 1 >= pageCount"
          size="xs"
          variant="outline"
          :label="t('replay.next')"
          @click="page++" />
      </div>
    </template>
  </div>
</template>
