<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContentRecord, PackageCampaignType } from '@scnexus/app-shared/types/content.type'
import wolLogo from '../../../assets/campaign/Campaign_WOL_LOGO.png'
import hotsLogo from '../../../assets/campaign/Campaign_HOTS_LOGO.png'
import lotvLogo from '../../../assets/campaign/Campaign_LOTV_LOGO.png'
import ncoLogo from '../../../assets/campaign/Campaign_NCO_LOGO.png'
defineOptions({ name: 'CampaignDetails' })
const props = defineProps<{ current: ContentRecord | null; busy: boolean; available: boolean }>()
const category = defineModel<PackageCampaignType>({ required: true })
const emit = defineEmits<{
  manage: [category: PackageCampaignType]
  operate: [record: ContentRecord, action: 'deactivate' | 'uninstall']
  launch: []
  folder: [record: ContentRecord]
  website: [url: string]
}>()
const { t } = useI18n()
const logos = { WOL: wolLogo, HOTS: hotsLogo, LOTV: lotvLogo, NCO: ncoLogo }
const categories = computed(() =>
  ['WOL', 'HOTS', 'LOTV', 'NCO'].map((value) => ({ label: t(`campaign.${value}`), value })),
)
import wolThumbnail from '../../../assets/campaign/Campaign_WOL_thumbnail.png'
import hotsThumbnail from '../../../assets/campaign/Campaign_HOTS_thumbnail.png'
import lotvThumbnail from '../../../assets/campaign/Campaign_LOTV_thumbnail.png'
import thumbnail from '../../../assets/campaign/Campaign_thumbnail.png'
const image = { WOL: wolThumbnail, HOTS: hotsThumbnail, LOTV: lotvThumbnail, NCO: thumbnail }
function size(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}
</script>
<template>
  <UTabs v-model="category" :items="categories" :content="false" variant="link">
    <template #leading="{ item }">
      <img
        draggable="false"
        :src="image[item.value as PackageCampaignType]"
        alt=""
        class="size-6 object-contain"
      />
    </template>
  </UTabs>
  <div class="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
    <UCard class="min-w-0" :ui="{ body: 'p-2 sm:p-2' }">
      <div class="flex h-full flex-col items-center gap-2 text-center">
        <img draggable="false" :src="logos[category]" alt="" class="h-32 w-full object-contain" />
        <h2 class="font-semibold">{{ t(`campaign.${category}`) }}</h2>
        <template v-if="props.current">
          <p class="max-w-full break-words">{{ props.current.package.name }}</p>
          <UBadge variant="subtle">
            {{ props.current.package.version }} · {{ props.current.mode }}
          </UBadge>
          <p class="max-w-full break-words text-sm text-muted">
            {{ props.current.package.author }}
          </p>
        </template>
        <UBadge v-else color="neutral" variant="subtle">
          {{ t('campaign.official') }}
        </UBadge>
        <div class="mt-auto flex w-full flex-col gap-1">
          <UButton
            icon="i-tabler-arrows-exchange"
            size="sm"
            block
            :disabled="props.busy || !props.available"
            @click="emit('manage', category)"
          >
            {{ t(props.current ? 'campaign.switch' : 'campaign.activate') }}
          </UButton>
          <UButton
            icon="i-tabler-refresh"
            v-if="props.current"
            size="sm"
            block
            color="neutral"
            variant="outline"
            :disabled="props.busy"
            @click="emit('operate', props.current, 'deactivate')"
          >
            {{ t('campaign.restore') }}
          </UButton>
          <UButton
            icon="i-tabler-trash"
            v-if="props.current"
            size="sm"
            block
            color="error"
            variant="soft"
            :disabled="props.busy"
            @click="emit('operate', props.current, 'uninstall')"
          >
            {{ t('campaign.uninstall') }}
          </UButton>
          <UButton
            block
            icon="i-tabler-player-play"
            :disabled="props.busy || !props.available"
            @click="emit('launch')"
          >
            {{ t('campaign.start') }}
          </UButton>
        </div>
      </div>
    </UCard>
    <UCard class="min-w-0" :ui="{ body: 'p-3 sm:p-3' }">
      <div class="space-y-2 break-words text-sm">
        <h3 class="font-semibold">{{ t('campaign.details') }}</h3>
        <p class="whitespace-pre-wrap">
          {{ props.current?.package.description || t('campaign.overviewHint') }}
        </p>
        <template v-if="props.current">
          <p>SCNID: {{ props.current.package.scnid ?? '—' }}</p>
          <p>
            {{ props.current.fileCount }} {{ t('campaign.files') }} ·
            {{ size(props.current.bytes) }}
          </p>
          <p class="break-all">{{ props.current.managementDirectory }}</p>
          <UButton
            icon="i-tabler-folder"
            color="neutral"
            variant="outline"
            @click="emit('folder', props.current)"
          >
            {{ t('campaign.openFolder') }}
          </UButton>
          <UButton
            icon="i-tabler-external-link"
            v-if="props.current.package.website"
            color="neutral"
            variant="ghost"
            @click="emit('website', props.current.package.website)"
          >
            {{ t('ui.website') }}
          </UButton>
          <div
            v-for="(group, key) in {
              social: props.current.package.social,
              sponsor: props.current.package.sponsor,
            }"
            :key="key"
            class="space-y-1"
          >
            <p v-for="(value, name) in group" :key="name" class="break-all">
              {{ name }}: {{ value }}
            </p>
          </div>
        </template>
      </div>
    </UCard>
  </div>
</template>
