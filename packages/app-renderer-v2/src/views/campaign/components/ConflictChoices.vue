<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import type { Conflict, ConflictDecision } from '@scnexus/app-shared/types/content.type'
defineOptions({ name: 'CampaignConflictChoices' })
const props = defineProps<{ files: Conflict[] }>()
const decisions = defineModel<ConflictDecision[]>({ required: true })
const { t } = useI18n()
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
      v-for="file in props.files"
      :key="file.conflictId"
      class="rounded border border-warning p-2 text-sm"
    >
      <p class="font-medium">{{ file.type }} · {{ file.incoming.name }}</p>
      <p class="break-all">
        {{ t('campaign.incoming') }}: {{ file.incoming.path }} · {{ file.incoming.bytes }} B ·
        {{ date(file.incoming.modifiedAt) }}
      </p>
      <p class="break-all">
        {{ t('campaign.local') }}: {{ file.local.path }} · {{ file.local.bytes }} B ·
        {{ date(file.local.modifiedAt) }}
      </p>
      <USelect
        class="mt-1 w-full"
        :placeholder="t('campaign.chooseConflict')"
        :items="[
          { label: t('campaign.overwrite'), value: 'overwrite' },
          { label: t('campaign.keep'), value: 'keep' },
        ]"
        :model-value="decisions.find((item) => item.conflictId === file.conflictId)?.action"
        @update:model-value="(value) => choose(file.conflictId, value as 'keep' | 'overwrite')"
      />
    </div>
  </div>
</template>
