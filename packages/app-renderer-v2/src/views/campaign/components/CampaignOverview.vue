<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import type {
  ActiveCampaign,
  ContentRecord,
  PackageCampaignType,
} from '@scnexus/app-shared/types/content.type'
import wol from '../../../assets/campaign/Campaign_WOL_Banner.png'
import hots from '../../../assets/campaign/Campaign_HOTS_Banner.png'
import lotv from '../../../assets/campaign/Campaign_LOTV_Banner.png'
import nco from '../../../assets/campaign/Campaign_NCO_Banner.png'
defineOptions({ name: 'CampaignOverview' })
const props = defineProps<{
  records: ContentRecord[]
  active: Partial<Record<PackageCampaignType, ActiveCampaign>>
  busy: boolean
}>()
const emit = defineEmits<{
  manage: [category: PackageCampaignType]
  deactivate: [record: ContentRecord]
  uninstall: [record: ContentRecord]
}>()
const { t } = useI18n()
const campaigns: PackageCampaignType[] = ['WOL', 'HOTS', 'LOTV', 'NCO']
const banners = { WOL: wol, HOTS: hots, LOTV: lotv, NCO: nco }
function current(category: PackageCampaignType) {
  return props.records.find((record) => record.localId === props.active[category]?.localId)
}
</script>
<template>
  <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
    <UCard v-for="category in campaigns" :key="category" :ui="{ body: 'p-0 sm:p-0' }">
      <div class="relative h-24 overflow-hidden">
        <img
          draggable="false"
          :src="banners[category]"
          :alt="t(`campaign.${category}`)"
          class="h-full w-full object-cover object-top"
        />
      </div>
      <div class="space-y-2 p-2">
        <div class="flex items-center justify-between gap-1">
          <h2 class="font-semibold">{{ t(`campaign.${category}`) }}</h2>
          <UBadge :color="props.active[category] ? 'success' : 'neutral'" variant="subtle">
            {{ t(props.active[category] ? 'campaign.active' : 'campaign.official') }}
          </UBadge>
        </div>
        <div v-if="current(category)" class="space-y-1 text-center">
          <p class="font-medium">{{ current(category)?.package.name }}</p>
          <p class="text-xs text-muted">
            {{ t('campaign.version') }}: {{ current(category)?.package.version }} ·
            {{ t('campaign.author') }}: {{ current(category)?.package.author }}
          </p>
        </div>
        <div class="flex flex-wrap items-center justify-center gap-1">
          <UButton
            icon="i-tabler-arrows-exchange"
            size="sm"
            :disabled="props.busy"
            @click="emit('manage', category)"
          >
            {{ t(props.active[category] ? 'campaign.switch' : 'campaign.activate') }}
          </UButton>
          <UButton
            icon="i-tabler-refresh"
            size="sm"
            v-if="current(category)"
            color="neutral"
            variant="outline"
            :disabled="props.busy"
            @click="emit('deactivate', current(category)!)"
          >
            {{ t('campaign.restore') }}
          </UButton>
          <UButton
            icon="i-tabler-trash"
            size="sm"
            v-if="current(category)"
            color="error"
            variant="soft"
            :disabled="props.busy"
            @click="emit('uninstall', current(category)!)"
          >
            {{ t('campaign.uninstall') }}
          </UButton>
          <span class="ml-auto text-xs text-muted">
            {{ props.records.filter((record) => record.package.campaign === category).length }}
            {{ t('campaign.packages') }}
          </span>
        </div>
      </div>
    </UCard>
  </div>
</template>
