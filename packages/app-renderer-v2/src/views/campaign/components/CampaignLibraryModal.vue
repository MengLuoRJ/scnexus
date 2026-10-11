<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize } from '../formatFileSize'
import type {
  ContentRecord,
  ActiveCampaign,
  PackageCampaignType,
} from '@scnexus/app-shared/types/content.type'
import FileTree from './FileTree.vue'
defineOptions({ name: 'CampaignLibraryModal' })
const props = defineProps<{
  records: ContentRecord[]
  active: Partial<Record<PackageCampaignType, ActiveCampaign>>
  category: PackageCampaignType
  busy: boolean
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  operate: [record: ContentRecord, action: 'activate' | 'deactivate' | 'uninstall']
  folder: [record: ContentRecord]
}>()
const { t } = useI18n()
const selected = ref<ContentRecord | null>(null)
const list = computed(() =>
  props.records.filter((record) => record.package.campaign === props.category),
)
import wolThumbnail from '../../../assets/campaign/Campaign_WOL_thumbnail.png'
import hotsThumbnail from '../../../assets/campaign/Campaign_HOTS_thumbnail.png'
import lotvThumbnail from '../../../assets/campaign/Campaign_LOTV_thumbnail.png'
import thumbnail from '../../../assets/campaign/Campaign_thumbnail.png'
const image = { WOL: wolThumbnail, HOTS: hotsThumbnail, LOTV: lotvThumbnail, NCO: thumbnail }
</script>
<template>
  <UModal
    v-model:open="open"
    :title="t('campaign.switch')"
    :ui="{ content: 'sm:max-w-3xl', body: 'min-h-0 break-words p-4 sm:p-4' }"
  >
    <template #body>
      <div class="space-y-2">
        <UAlert v-if="!list.length" :title="t('campaign.empty')" color="neutral" />
        <UCard v-for="record in list" :key="record.localId" :ui="{ body: 'p-2 sm:p-2' }">
          <div class="flex flex-wrap items-center gap-2">
            <img
              draggable="false"
              :src="image[props.category]"
              class="size-10 rounded object-cover"
              alt=""
            />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1">
                <span class="font-semibold">{{ record.package.name }}</span>
                <UBadge color="neutral" variant="subtle">
                  {{ record.package.version || '—' }}
                </UBadge>
                <UBadge variant="subtle">{{ record.mode }}</UBadge>
                <UBadge
                  v-if="props.active[props.category]?.localId === record.localId"
                  color="success"
                >
                  {{ t('campaign.active') }}
                </UBadge>
              </div>
              <p class="text-xs text-muted">
                {{ record.package.author }} · {{ record.fileCount }} {{ t('campaign.files') }} ·
                {{ formatFileSize(record.bytes) }}
              </p>
            </div>
            <div class="flex flex-wrap gap-1">
              <UButton
                icon="i-tabler-info-circle"
                color="neutral"
                variant="ghost"
                @click="selected = record"
              >
                {{ t('campaign.details') }}
              </UButton>
              <UButton
                icon="i-tabler-refresh"
                v-if="props.active[props.category]?.localId === record.localId"
                :disabled="props.busy"
                color="warning"
                variant="soft"
                @click="emit('operate', record, 'deactivate')"
              >
                {{ t('campaign.deactivate') }}
              </UButton>
              <UButton
                icon="i-tabler-check"
                v-else
                :disabled="props.busy || !record.payloadDirectory"
                @click="emit('operate', record, 'activate')"
              >
                {{ t(props.active[props.category] ? 'campaign.switch' : 'campaign.activate') }}
              </UButton>
              <UButton
                icon="i-tabler-trash"
                color="error"
                variant="soft"
                :disabled="props.busy"
                @click="emit('operate', record, 'uninstall')"
              >
                {{ t('campaign.uninstall') }}
              </UButton>
            </div>
          </div>
        </UCard>
        <p v-if="props.active[props.category]" class="text-xs text-muted">
          {{ t('campaign.switchHint') }}
        </p>
      </div>
    </template>
  </UModal>
  <UModal
    :open="Boolean(selected)"
    :title="selected?.package.name"
    :ui="{ title: 'min-w-0 break-words', body: 'min-h-0 break-words p-4 sm:p-4' }"
    @update:open="
      (value: boolean) => {
        if (!value) selected = null
      }
    "
  >
    <template #body>
      <div v-if="selected" class="space-y-2 text-sm">
        <p class="whitespace-pre-wrap">{{ selected.package.description }}</p>
        <p class="break-all">{{ selected.managementDirectory }}</p>
        <UButton
          icon="i-tabler-folder"
          color="neutral"
          variant="outline"
          @click="emit('folder', selected)"
        >
          {{ t('campaign.openFolder') }}
        </UButton>
        <FileTree :tree="selected.targetTree" />
      </div>
    </template>
  </UModal>
</template>
