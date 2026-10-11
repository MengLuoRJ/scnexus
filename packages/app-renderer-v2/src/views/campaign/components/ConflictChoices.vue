<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize } from '../formatFileSize'
import type { Conflict, ConflictDecision } from '@scnexus/app-shared/types/content.type'
defineOptions({ name: 'CampaignConflictChoices' })
const props = defineProps<{ files: Conflict[] }>()
const decisions = defineModel<ConflictDecision[]>({ required: true })
const { t } = useI18n()
const actions = computed(() => [
  { label: t('campaign.overwrite'), value: 'overwrite' as const },
  { label: t('campaign.keep'), value: 'keep' as const },
])
function allSelected(action: ConflictDecision['action']) {
  return props.files.every((file) =>
    decisions.value.some((item) => item.conflictId === file.conflictId && item.action === action),
  )
}
function chooseAll(action: ConflictDecision['action']) {
  decisions.value = props.files.map((file) => ({ conflictId: file.conflictId, action }))
}
function choose(id: string, action: 'keep' | 'overwrite') {
  decisions.value = [
    ...decisions.value.filter((item) => item.conflictId !== id),
    { conflictId: id, action },
  ]
}
function date(value: number | null) {
  return value === null ? '—' : new Date(value).toLocaleString()
}
</script>
<template>
  <div class="space-y-2">
    <div
      v-if="props.files.length > 1"
      class="flex flex-wrap items-center gap-2 rounded border border-default bg-elevated/50 p-2"
      role="group"
      :aria-label="t('campaign.applyAll')"
    >
      <span class="text-sm font-medium">{{ t('campaign.applyAll') }}</span>
      <UButton
        v-for="action in actions"
        :key="action.value"
        size="sm"
        :color="allSelected(action.value) ? 'primary' : 'neutral'"
        :variant="allSelected(action.value) ? 'solid' : 'outline'"
        :aria-pressed="allSelected(action.value)"
        @click="chooseAll(action.value)"
        >{{
          t(action.value === 'overwrite' ? 'campaign.overwriteAll' : 'campaign.keepAll')
        }}</UButton
      >
    </div>
    <div
      v-for="file in props.files"
      :key="file.conflictId"
      class="rounded border border-warning p-2 text-sm"
    >
      <p class="font-medium">{{ file.type }} · {{ file.incoming.name }}</p>
      <p class="break-all">
        {{ t('campaign.incoming') }}: {{ file.incoming.path }} ·
        {{ formatFileSize(file.incoming.bytes) }} ·
        {{ date(file.incoming.modifiedAt) }}
      </p>
      <p class="break-all">
        {{ t('campaign.local') }}: {{ file.local.path }} · {{ formatFileSize(file.local.bytes) }} ·
        {{ date(file.local.modifiedAt) }}
      </p>
      <div
        class="mt-2 flex flex-wrap gap-1"
        role="group"
        :aria-label="`${t('campaign.conflicts')} · ${file.incoming.name}`"
      >
        <UButton
          v-for="action in actions"
          :key="action.value"
          size="sm"
          :color="
            decisions.some(
              (item) => item.conflictId === file.conflictId && item.action === action.value,
            )
              ? 'primary'
              : 'neutral'
          "
          :variant="
            decisions.some(
              (item) => item.conflictId === file.conflictId && item.action === action.value,
            )
              ? 'solid'
              : 'outline'
          "
          :aria-pressed="
            decisions.some(
              (item) => item.conflictId === file.conflictId && item.action === action.value,
            )
          "
          @click="choose(file.conflictId, action.value)"
          >{{ action.label }}</UButton
        >
      </div>
    </div>
  </div>
</template>
