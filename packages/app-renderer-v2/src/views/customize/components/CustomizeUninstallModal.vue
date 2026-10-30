<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContentRecord, RemovalDecision } from '@scnexus/app-shared/types/content.type'
import type { useCustomize } from '../useCustomize'
defineOptions({ name: 'CustomizeUninstallModal' })
const props = defineProps<{
  service: ReturnType<typeof useCustomize>
  record: ContentRecord | null
}>()
const emit = defineEmits<{ close: []; completed: [] }>()
const { t } = useI18n()
const { busy, removal } = props.service
const choices = ref<RemovalDecision[]>([])
const executing = ref(false)
const preparing = ref(false)
const canConfirm = computed(
  () =>
    !busy.value &&
    !preparing.value &&
    Boolean(removal.value) &&
    (removal.value?.files ?? []).every((file) =>
      choices.value.some((choice) => choice.conflictId === file.conflictId),
    ),
)
watch(
  () => props.record,
  async (record) => {
    if (!record) return
    choices.value = []
    preparing.value = true
    await props.service.prepare(record)
    preparing.value = false
    if (!removal.value) emit('close')
  },
)
function choose(id: string, action: 'keep' | 'delete') {
  choices.value = [
    ...choices.value.filter((item) => item.conflictId !== id),
    { conflictId: id, action },
  ]
}
async function close() {
  if (busy.value || executing.value || preparing.value) return
  await props.service.close()
  if (!removal.value) emit('close')
}
async function confirm() {
  if (!canConfirm.value || executing.value) return
  executing.value = true
  const result = await props.service.confirm([], choices.value)
  executing.value = false
  if (result) {
    emit('completed')
    emit('close')
  } else await close()
}
</script>
<template>
  <UModal
    :open="Boolean(props.record)"
    :title="t('campaign.uninstall')"
    :dismissible="!busy && !executing && !preparing"
    :close="!busy && !executing && !preparing"
    :ui="{ content: 'sm:max-w-3xl', body: 'min-h-0 break-words p-4 sm:p-4', footer: 'shrink-0' }"
    @update:open="
      (value: boolean) => {
        if (!value) close()
      }
    ">
    <template #body>
      <div class="space-y-3">
        <p class="font-semibold">{{ props.record?.package.name }}</p>
        <p>{{ t('customize.uninstallConfirm') }}</p>
        <div v-if="busy || executing || preparing" role="status" aria-live="polite">
          <p>{{ t(executing ? 'campaign.executing' : 'campaign.preparing') }}</p>
          <UProgress />
        </div>
        <template v-else>
          <div
            v-for="file in removal?.files ?? []"
            :key="file.conflictId"
            class="space-y-2 rounded border border-warning p-2 text-sm">
            <p class="break-all">{{ file.file.target }}</p>
            <p>{{ t('campaign.usedBy') }}: {{ file.usedBy.map((item) => item.name).join(', ') }}</p>
            <div class="flex flex-wrap gap-1" role="group" :aria-label="file.file.target">
              <UButton
                v-for="action in ['keep', 'delete'] as const"
                :key="action"
                size="sm"
                :color="
                  choices.some(
                    (item) => item.conflictId === file.conflictId && item.action === action,
                  )
                    ? 'primary'
                    : 'neutral'
                "
                :variant="
                  choices.some(
                    (item) => item.conflictId === file.conflictId && item.action === action,
                  )
                    ? 'solid'
                    : 'outline'
                "
                :aria-pressed="
                  choices.some(
                    (item) => item.conflictId === file.conflictId && item.action === action,
                  )
                "
                @click="choose(file.conflictId, action)">
                {{ t(`campaign.${action}`) }}
              </UButton>
            </div>
          </div>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :disabled="busy || executing || preparing"
          @click="close">
          {{ t('campaign.cancel') }}
        </UButton>
        <UButton
          color="error"
          :disabled="!canConfirm || executing"
          :loading="executing"
          @click="confirm">
          {{ t('campaign.confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
