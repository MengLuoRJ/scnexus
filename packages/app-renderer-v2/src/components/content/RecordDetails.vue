<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { countRecognizedFiles } from '@scnexus/app-shared/utils/content-files'
import type { ContentRecord } from '@scnexus/app-shared/types/content.type'
import { formatFileSize } from '../../views/campaign/formatFileSize'
import FileTree from '../../views/campaign/components/FileTree.vue'
defineOptions({ name: 'ContentRecordDetails' })
const props = defineProps<{ record: ContentRecord }>()
const { t } = useI18n()
</script>
<template>
  <div class="space-y-3 text-sm">
    <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
      <div>
        <dt class="text-muted">{{ t('campaign.name') }}</dt>
        <dd class="break-words">{{ props.record.package.name }}</dd>
      </div>
      <div>
        <dt class="text-muted">{{ t('campaign.author') }}</dt>
        <dd class="break-words">{{ props.record.package.author || '—' }}</dd>
      </div>
      <div>
        <dt class="text-muted">{{ t('campaign.version') }}</dt>
        <dd>{{ props.record.package.version || '—' }}</dd>
      </div>
      <div>
        <dt class="text-muted">{{ t('campaign.contentSize') }}</dt>
        <dd>{{ formatFileSize(props.record.bytes) }}</dd>
      </div>
      <div>
        <dt class="text-muted">{{ t('campaign.standardFiles') }}</dt>
        <dd>{{ props.record.fileCount }}</dd>
      </div>
      <div>
        <dt class="text-muted">{{ t('campaign.recognizedFiles') }}</dt>
        <dd>{{ countRecognizedFiles(props.record.files) }}</dd>
      </div>
    </dl>
    <div>
      <p class="text-muted">{{ t('campaign.description') }}</p>
      <p class="whitespace-pre-wrap break-words">{{ props.record.package.description || '—' }}</p>
    </div>
    <div>
      <p class="text-muted">{{ t('campaign.installDirectory') }}</p>
      <p class="break-all">{{ props.record.managementDirectory }}</p>
    </div>
    <slot />
    <div class="space-y-2">
      <p class="text-muted">{{ t('campaign.targetTree') }}</p>
      <div class="max-h-72 overflow-auto rounded border border-default p-2">
        <FileTree :tree="props.record.targetTree" />
      </div>
    </div>
  </div>
</template>
