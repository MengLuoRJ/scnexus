<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { countRecognizedFiles } from '@scnexus/app-shared/utils/content-files'
import type {
  ContentRecord,
  ActiveCampaign,
  PackageCampaignType,
} from '@scnexus/app-shared/types/content.type'
import { formatFileSize } from '../formatFileSize'
import RecordDetails from '../../../components/content/RecordDetails.vue'

defineOptions({ name: 'CampaignManagement' })
const props = defineProps<{
  records: ContentRecord[]
  active: Partial<Record<PackageCampaignType, ActiveCampaign>>
  busy: boolean
}>()
const emit = defineEmits<{
  operate: [record: ContentRecord, action: 'activate' | 'deactivate' | 'uninstall']
  folder: [record: ContentRecord]
}>()
const { t } = useI18n()
const categories = ['WOL', 'HOTS', 'LOTV', 'NCO'] as const
const category = ref('all')
const selectedId = ref<string | null>(null)
const selected = computed(() => props.records.find((record) => record.localId === selectedId.value))
const list = computed(() =>
  props.records.filter(
    (record) => category.value === 'all' || record.package.campaign === category.value,
  ),
)
const totals = computed(() =>
  props.records.reduce(
    (total, record) => ({
      count: total.count + 1,
      files: total.files + record.fileCount,
      recognizedFiles: total.recognizedFiles + countRecognizedFiles(record.files),
      bytes: total.bytes + record.bytes,
    }),
    { count: 0, files: 0, recognizedFiles: 0, bytes: 0 },
  ),
)
const statistics = computed(() =>
  categories.map((campaign) => {
    const records = props.records.filter((record) => record.package.campaign === campaign)
    return {
      campaign,
      count: records.length,
      files: records.reduce((sum, record) => sum + record.fileCount, 0),
      recognizedFiles: records.reduce((sum, record) => sum + countRecognizedFiles(record.files), 0),
      bytes: records.reduce((sum, record) => sum + record.bytes, 0),
      modes: (['scnexus', 'ccm'] as const).map((mode) => ({
        mode,
        count: records.filter((record) => record.mode === mode).length,
        bytes: records
          .filter((record) => record.mode === mode)
          .reduce((sum, record) => sum + record.bytes, 0),
      })),
    }
  }),
)
function isActive(record: ContentRecord) {
  return Boolean(
    record.package.campaign && props.active[record.package.campaign]?.localId === record.localId,
  )
}
</script>

<template>
  <section class="space-y-3" :aria-label="t('campaign.libraryManagement')">
    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <UCard
        v-for="item in [
          { label: t('campaign.totalPackages'), value: totals.count.toLocaleString() },
          { label: t('campaign.totalFiles'), value: totals.files.toLocaleString() },
          {
            label: t('campaign.totalRecognizedFiles'),
            value: totals.recognizedFiles.toLocaleString(),
          },
          { label: t('campaign.totalBytes'), value: formatFileSize(totals.bytes) },
        ]"
        :key="item.label"
        :ui="{ body: 'p-3 sm:p-3' }"
      >
        <p class="text-xs text-muted">{{ item.label }}</p>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ item.value }}</p>
      </UCard>
    </div>
    <UCard :ui="{ body: 'space-y-3 p-3 sm:p-3' }">
      <h2 class="font-semibold">{{ t('campaign.statistics') }}</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        <div v-for="item in statistics" :key="item.campaign" class="min-w-0 space-y-1.5">
          <div class="flex flex-wrap items-baseline justify-between gap-1 text-sm">
            <span class="font-medium">{{ t(`campaign.${item.campaign}`) }}</span>
            <span class="text-muted"
              >{{ item.count }} {{ t('campaign.packages') }} · {{ t('campaign.standardFiles') }}:
              {{ item.files }} · {{ t('campaign.recognizedFiles') }}: {{ item.recognizedFiles }} ·
              {{ formatFileSize(item.bytes) }}</span
            >
          </div>
          <UProgress
            :model-value="item.bytes"
            :max="totals.bytes || 1"
            :aria-label="t(`campaign.${item.campaign}`)"
          />
          <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span v-for="mode in item.modes" :key="mode.mode"
              >{{ mode.mode === 'scnexus' ? 'SCNexus' : 'CCM' }}: {{ mode.count }} ·
              {{ formatFileSize(mode.bytes) }}</span
            >
          </div>
        </div>
      </div>
      <p class="text-xs text-muted">{{ t('campaign.statisticsHint') }}</p>
    </UCard>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-semibold">{{ t('campaign.installedPackages') }}</h2>
      <UTabs
        v-model="category"
        :content="false"
        size="xs"
        :items="[
          { label: t('campaign.allCategories'), value: 'all' },
          ...categories.map((value) => ({ label: t(`campaign.${value}`), value })),
        ]"
      />
    </div>
    <UAlert v-if="!list.length" color="neutral" variant="subtle" :title="t('campaign.empty')" />
    <UCard v-for="record in list" :key="record.localId" :ui="{ body: 'space-y-2 p-3 sm:p-3' }">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <h3 class="break-words font-semibold">{{ record.package.name }}</h3>
            <UBadge color="neutral" variant="subtle">{{ record.package.version || '—' }}</UBadge>
            <UBadge variant="subtle">{{ record.mode === 'scnexus' ? 'SCNexus' : 'CCM' }}</UBadge>
            <UBadge v-if="isActive(record)" color="success">{{ t('campaign.active') }}</UBadge>
            <UBadge v-if="record.external" color="warning" variant="subtle">{{
              t('campaign.externalRecord')
            }}</UBadge>
          </div>
          <p class="text-xs text-muted">
            {{ t(`campaign.${record.package.campaign}`) }} · {{ t('campaign.author') }}:
            {{ record.package.author || '—' }}
          </p>
          <p class="text-xs text-muted">
            {{ t('campaign.standardFiles') }}: {{ record.fileCount }} ·
            {{ t('campaign.recognizedFiles') }}: {{ countRecognizedFiles(record.files) }} ·
            {{ formatFileSize(record.bytes) }}
          </p>
        </div>
        <div class="flex flex-wrap gap-1">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-tabler-info-circle"
            @click="selectedId = record.localId"
            >{{ t('campaign.details') }}</UButton
          >
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-tabler-folder"
            :disabled="props.busy"
            @click="emit('folder', record)"
            >{{ t('campaign.openFolder') }}</UButton
          >
          <UButton
            v-if="isActive(record)"
            color="warning"
            variant="soft"
            size="sm"
            icon="i-tabler-restore"
            :disabled="props.busy"
            @click="emit('operate', record, 'deactivate')"
            >{{ t('campaign.deactivate') }}</UButton
          >
          <UButton
            v-else
            size="sm"
            icon="i-tabler-check"
            :disabled="props.busy || !record.payloadDirectory"
            @click="emit('operate', record, 'activate')"
            >{{
              t(
                record.package.campaign && props.active[record.package.campaign]
                  ? 'campaign.switch'
                  : 'campaign.activate',
              )
            }}</UButton
          >
          <UButton
            color="error"
            variant="soft"
            size="sm"
            icon="i-tabler-trash"
            :disabled="props.busy"
            @click="emit('operate', record, 'uninstall')"
            >{{ t('campaign.uninstall') }}</UButton
          >
        </div>
      </div>
      <p v-if="!record.payloadDirectory" class="text-xs text-muted">
        {{ t('campaign.activationUnavailable') }}
      </p>
    </UCard>
    <p v-if="list.length" class="text-xs text-muted">{{ t('campaign.switchHint') }}</p>
  </section>
  <UModal
    :open="Boolean(selected)"
    :title="selected?.package.name"
    :ui="{
      content: 'sm:max-w-3xl',
      title: 'min-w-0 break-words',
      body: 'space-y-2 break-words p-4 sm:p-4',
    }"
    @update:open="
      (value: boolean) => {
        if (!value) selectedId = null
      }
    "
  >
    <template #body>
      <RecordDetails v-if="selected" :record="selected" />
    </template>
  </UModal>
</template>
