<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  ContentRecord,
  ConflictDecision,
  RemovalDecision,
} from '@scnexus/app-shared/types/content.type'
import type { CampaignOperationRequest, useCampaign } from '../useCampaign'
import ConflictChoices from './ConflictChoices.vue'
defineOptions({ name: 'CampaignOperationModal' })
const props = defineProps<{
  service: ReturnType<typeof useCampaign>
  request: CampaignOperationRequest | null
}>()
const emit = defineEmits<{ close: []; completed: [action: CampaignOperationRequest['action']] }>()
const { t } = useI18n()
const { busy, activation, removal, conflicts } = props.service
const decisions = ref<ConflictDecision[]>([])
const removals = ref<RemovalDecision[]>([])
const restoringFirst = ref(false)
const subject = ref<ContentRecord | null>(null)
const executing = ref(false)
const preparing = ref(false)
const canConfirm = computed(
  () =>
    !busy.value &&
    !preparing.value &&
    Boolean(activation.value || removal.value) &&
    conflicts.value.every((file) =>
      decisions.value.some((item) => item.conflictId === file.conflictId),
    ) &&
    (removal.value?.files ?? []).every((file) =>
      removals.value.some((item) => item.conflictId === file.conflictId),
    ),
)
const switching = computed(() => props.request?.action === 'activate' && restoringFirst.value)
const title = computed(() =>
  t(
    restoringFirst.value
      ? 'campaign.restore'
      : props.request?.action === 'activate'
        ? 'campaign.activate'
        : props.request?.action === 'uninstall'
          ? 'campaign.uninstall'
          : 'campaign.restore',
  ),
)
watch(
  () => props.request,
  async (request) => {
    if (!request) return
    decisions.value = []
    removals.value = []
    const campaign = request.record.package.campaign!
    const activeId = props.service.active.value[campaign]?.localId
    const previous = props.service.records.value.find((record) => record.localId === activeId)
    restoringFirst.value = Boolean(
      previous &&
      ((request.action === 'uninstall' && activeId === request.record.localId) ||
        (request.action === 'activate' && activeId !== request.record.localId)),
    )
    subject.value = restoringFirst.value ? previous! : request.record
    preparing.value = true
    await props.service.prepare(subject.value, restoringFirst.value ? 'deactivate' : request.action)
    preparing.value = false
    if (!activation.value && !removal.value) emit('close')
  },
)
function choose(id: string, action: 'keep' | 'delete') {
  removals.value = [
    ...removals.value.filter((item) => item.conflictId !== id),
    { conflictId: id, action },
  ]
}
async function close() {
  if (busy.value || preparing.value || executing.value) return
  await props.service.close()
  if (!activation.value && !removal.value) emit('close')
}
async function confirm() {
  if (!canConfirm.value || !props.request) return
  executing.value = true
  const result = await props.service.confirm(decisions.value, removals.value)
  if (result && restoringFirst.value) {
    emit('completed', 'deactivate')
    restoringFirst.value = false
    subject.value = props.request.record
    decisions.value = []
    removals.value = []
    await props.service.prepare(props.request.record, props.request.action)
    if (!activation.value && !removal.value) emit('close')
  } else if (result) {
    emit('completed', props.request.action)
    emit('close')
  }
  executing.value = false
  if (!result) await close()
}
</script>
<template>
  <UModal
    :open="Boolean(props.request)"
    :title="title"
    :dismissible="!busy && !executing && !preparing"
    :close="!busy && !executing && !preparing"
    :ui="{ content: 'sm:max-w-3xl', body: 'min-h-0 break-words p-4 sm:p-4', footer: 'shrink-0' }"
    @update:open="
      (value: boolean) => {
        if (!value) close()
      }
    "
  >
    <template #body>
      <div class="space-y-3">
        <p class="font-semibold">{{ subject?.package.name }}</p>
        <p v-if="switching" class="text-sm text-muted">
          {{ t('campaign.switchTarget') }}: {{ props.request?.record.package.name }}
        </p>
        <p>
          {{
            t(
              restoringFirst
                ? switching
                  ? 'campaign.switchConfirm'
                  : 'campaign.uninstallActiveHint'
                : props.request?.action === 'activate'
                  ? 'campaign.activateConfirm'
                  : props.request?.action === 'uninstall'
                    ? 'campaign.uninstallConfirm'
                    : 'campaign.restoreConfirm',
            )
          }}
        </p>
        <div
          v-if="busy || preparing || executing"
          role="status"
          aria-live="polite"
          class="space-y-2"
        >
          <p>{{ t(executing ? 'campaign.executing' : 'campaign.preparing') }}</p>
          <UProgress />
        </div>
        <template v-else>
          <ConflictChoices v-model="decisions" :files="conflicts" />
          <template v-if="removal">
            <p class="text-sm text-muted">{{ t('campaign.removeConfirm') }}</p>
            <div
              v-for="file in removal.files"
              :key="file.conflictId"
              class="space-y-1 rounded border border-warning p-2 text-sm"
            >
              <p class="break-all">{{ file.file.target }}</p>
              <p>
                {{ t('campaign.usedBy') }}: {{ file.usedBy.map((item) => item.name).join(', ') }}
              </p>
              <USelect
                class="w-full"
                :placeholder="t('campaign.chooseConflict')"
                :items="[
                  { label: t('campaign.keep'), value: 'keep' },
                  { label: t('campaign.delete'), value: 'delete' },
                ]"
                :model-value="removals.find((item) => item.conflictId === file.conflictId)?.action"
                @update:model-value="
                  (value: string) => choose(file.conflictId, value as 'keep' | 'delete')
                "
              />
            </div>
          </template>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :disabled="busy || executing || preparing"
          @click="close"
          >{{ t('campaign.cancel') }}</UButton
        >
        <UButton
          :color="props.request?.action === 'uninstall' && !restoringFirst ? 'error' : 'primary'"
          :disabled="!canConfirm || executing"
          :loading="executing"
          @click="confirm"
          >{{ t('campaign.confirm') }}</UButton
        >
      </div>
    </template>
  </UModal>
</template>
