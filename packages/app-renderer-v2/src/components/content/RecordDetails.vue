<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContentAssets } from '@scnexus/app-shared/types/content.type'
import { ipcContentAssets } from '../../ipcs/content'
import { ipcUnwrap } from '../../ipcs/internal/ipc-common'
import { countRecognizedFiles } from '@scnexus/app-shared/utils/content-files'
import type { ContentRecord } from '@scnexus/app-shared/types/content.type'
import { formatFileSize } from '../../views/campaign/formatFileSize'
import FileTree from '../../views/campaign/components/FileTree.vue'
import PackageDocuments from './PackageDocuments.vue'
defineOptions({ name: 'ContentRecordDetails' })
const props = defineProps<{ record: ContentRecord }>()
const { t } = useI18n()
const assets = ref<ContentAssets | null>(null)
const tab = ref('details')
const documentPath = ref('')
const fragment = ref('')
const tabs = computed(() => [
  { label: t('campaign.details'), value: 'details' },
  { label: t('campaign.targetTree'), value: 'files' },
  ...(assets.value?.readme ? [{ label: 'README', value: 'readme' }] : []),
  ...(assets.value?.changelog ? [{ label: t('contentMedia.changelog'), value: 'changelog' }] : []),
  ...(assets.value?.docs.length
    ? [{ label: t('contentMedia.relatedDocuments'), value: 'documents' }]
    : []),
])
watch(
  () => props.record.localId,
  async (id, _, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    assets.value = null
    tab.value = 'details'
    documentPath.value = ''
    fragment.value = ''
    try {
      const result = await ipcUnwrap(ipcContentAssets(id))
      if (!cancelled) assets.value = result
    } catch {
      // Unavailable asset indexes must not expose document tabs.
    }
  },
  { immediate: true },
)
watch(tab, (value) => {
  documentPath.value =
    value === 'readme'
      ? (assets.value?.readme ?? '')
      : value === 'changelog'
        ? (assets.value?.changelog ?? '')
        : value === 'documents'
          ? (assets.value?.docs[0] ?? '')
          : ''
  fragment.value = ''
})
function navigate(path: string, anchor = '') {
  documentPath.value = path
  fragment.value = anchor
}
</script>
<template>
  <div class="min-w-0 space-y-3 text-sm">
    <UTabs
      v-model="tab"
      :items="tabs"
      :content="false"
      size="sm"
      class="min-w-0"
      :ui="{ list: 'overflow-x-auto', trigger: 'shrink-0' }" />
    <div class="max-h-[min(60vh,28rem)] min-h-0 overflow-auto">
      <div v-if="tab === 'details'" class="space-y-3">
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
            <dt class="text-muted">{{ t('campaign.installMode') }}</dt>
            <dd>{{ props.record.mode === 'scnexus' ? 'SCNexus' : 'CCM' }}</dd>
          </div>
          <div v-if="props.record.package.campaign">
            <dt class="text-muted">{{ t('campaign.type') }}</dt>
            <dd>{{ t(`campaign.${props.record.package.campaign}`) }}</dd>
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
          <p class="whitespace-pre-wrap break-words">
            {{ props.record.package.description || '—' }}
          </p>
        </div>
        <div>
          <p class="text-muted">{{ t('campaign.installDirectory') }}</p>
          <p class="break-all">{{ props.record.managementDirectory }}</p>
        </div>
        <div>
          <p class="text-muted">{{ t('customize.launcher') }}</p>
          <p class="break-all">{{ props.record.launcherTarget || t('customize.launcherNone') }}</p>
        </div>
        <div>
          <p class="text-muted">{{ t('contentMedia.payloadDirectory') }}</p>
          <p class="break-all">{{ props.record.payloadDirectory || '—' }}</p>
        </div>
        <slot />
      </div>
      <div v-else-if="tab === 'files'" class="rounded border border-default p-2">
        <FileTree :tree="props.record.targetTree" />
      </div>
      <PackageDocuments
        v-else-if="documentPath"
        :local-id="props.record.localId"
        :path="documentPath"
        :fragment="fragment"
        :documents="tab === 'documents' ? assets?.docs : undefined"
        @navigate="navigate" />
    </div>
  </div>
</template>
