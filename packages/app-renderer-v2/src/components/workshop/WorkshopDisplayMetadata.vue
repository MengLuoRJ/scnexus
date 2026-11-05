<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import type { PackageLocalization } from './display-metadata'
import type { WorkshopDocument } from './document'
import WorkshopRichText from './WorkshopRichText.vue'
defineOptions({ name: 'WorkshopDisplayMetadata' })
const props = defineProps<{
  value: {
    tags?: string[]
    version?: string | null
    localization?: PackageLocalization[]
    changelog?: WorkshopDocument
  }
}>()
const { t } = useI18n()
</script>
<template>
  <section class="space-y-3 text-sm min-w-0">
    <p v-if="props.value.version">{{ t('workshop.displayVersion') }}: {{ props.value.version }}</p>
    <div
      v-if="props.value.tags?.length"
      class="flex flex-wrap gap-1"
      :aria-label="t('workshop.tags')">
      <UBadge
        v-for="(tag, index) in props.value.tags"
        :key="index"
        color="neutral"
        variant="subtle"
        class="max-w-full whitespace-normal break-words">
        {{ tag }}
      </UBadge>
    </div>
    <details v-if="props.value.localization?.length" class="space-y-2">
      <summary class="cursor-pointer font-medium">{{ t('workshop.localization') }}</summary>
      <dl
        v-for="(item, index) in props.value.localization"
        :key="index"
        class="border border-default rounded p-2 space-y-1 break-words">
        <dt class="font-medium">{{ item.locale }}</dt>
        <dd
          v-for="field in ['name', 'description', 'author', 'version'] as const"
          v-show="item[field] !== undefined"
          :key="field"
          class="whitespace-pre-wrap">
          {{ t(`workshop.locale.${field}`) }}: {{ item[field] }}
        </dd>
        <dd v-if="item.translators">
          {{ t('workshop.locale.translators') }}: {{ item.translators.join(', ') }}
        </dd>
      </dl>
    </details>
    <section v-if="props.value.changelog?.content?.length" class="space-y-2">
      <h3 class="font-medium">{{ t('workshop.changelog') }}</h3>
      <WorkshopRichText :document="props.value.changelog" />
    </section>
  </section>
</template>
