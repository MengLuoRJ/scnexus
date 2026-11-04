<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import type { InstallPreview } from '@scnexus/app-shared/types/content.type'
import { countRecognizedFiles } from '@scnexus/app-shared/utils/content-files'
import { formatFileSize } from '../campaign/formatFileSize'
import FileTree from '../campaign/components/FileTree.vue'
defineOptions({ name: 'EditorToolboxValidationPreview' })
const props = defineProps<{ preview: InstallPreview }>()
const { t } = useI18n()
</script>
<template>
  <div class="min-w-0 space-y-3 text-sm">
    <h3 class="font-semibold">{{ t('campaign.basicInfo') }}</h3>
    <dl class="grid grid-cols-2 gap-2">
      <div v-for="key in ['name', 'author', 'version', 'type'] as const" :key="key" class="min-w-0">
        <dt class="text-muted">{{ t(`campaign.${key}`) }}</dt>
        <dd class="break-all">{{ props.preview.package[key] || '—' }}</dd>
      </div>
      <div>
        <dt class="text-muted">SCNID</dt>
        <dd>{{ props.preview.package.scnid ?? '—' }}</dd>
      </div>
      <div v-if="props.preview.package.campaign">
        <dt class="text-muted">{{ t('campaign.type') }}</dt>
        <dd>{{ t(`campaign.${props.preview.package.campaign}`) }}</dd>
      </div>
      <div>
        <dt class="text-muted">{{ t('campaign.origin') }}</dt>
        <dd>{{ props.preview.origin }}</dd>
      </div>
      <div>
        <dt class="text-muted">{{ t('toolbox.packageRoot') }}</dt>
        <dd class="break-all">{{ props.preview.rootRelativePath || '/' }}</dd>
      </div>
    </dl>
    <p class="whitespace-pre-wrap break-words">{{ props.preview.package.description || '—' }}</p>
    <p>
      {{ t('campaign.standardFiles') }}: {{ props.preview.fileCount }} ·
      {{ t('campaign.recognizedFiles') }}: {{ countRecognizedFiles(props.preview.files) }} ·
      {{ formatFileSize(props.preview.bytes) }}
    </p>
    <div class="space-y-1">
      <p class="font-semibold">{{ t('customize.launcher') }}</p>
      <p class="break-all">
        {{ props.preview.launcher.target || t('customize.launcherNone') }} ·
        {{ props.preview.launcher.source }}
      </p>
      <p
        v-for="candidate in props.preview.launcher.candidates"
        :key="candidate.target"
        class="break-all text-xs text-muted">
        {{ candidate.name }} → {{ candidate.target }}
      </p>
    </div>
    <section>
      <h3 class="mb-2 font-semibold">{{ t('toolbox.plannedTree') }}</h3>
      <p class="mb-2 text-xs text-muted">{{ t('toolbox.planOnly') }}</p>
      <div class="max-h-64 overflow-auto rounded border border-default p-2">
        <FileTree :tree="props.preview.targetTree" />
      </div>
    </section>
    <details>
      <summary class="cursor-pointer font-semibold">
        {{ t('toolbox.resourceMapping') }} ({{ props.preview.files.length }})
      </summary>
      <div class="mt-2 max-h-64 space-y-2 overflow-auto text-xs">
        <dl
          v-for="file in props.preview.files"
          :key="file.source + file.target"
          class="space-y-1 rounded border border-default p-2">
          <div>
            <dt class="text-muted">{{ t('toolbox.sourcePath') }}</dt>
            <dd class="break-all">{{ file.source }}</dd>
          </div>
          <div>
            <dt class="text-muted">{{ t('toolbox.targetPath') }}</dt>
            <dd class="break-all">{{ file.target }}</dd>
          </div>
          <div>
            {{ file.type }} · {{ formatFileSize(file.bytes) }} ·
            {{ t('toolbox.officialResource') }}:
            {{ t(file.official ? 'toolbox.yes' : 'toolbox.no') }}
          </div>
          <div>
            {{ t('toolbox.modifiedAt') }}:
            {{ file.modifiedAt === null ? '—' : new Date(file.modifiedAt).toLocaleString() }}
          </div>
        </dl>
      </div>
    </details>
    <details>
      <summary class="cursor-pointer font-semibold">{{ t('toolbox.internalInfo') }}</summary>
      <pre
        class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border border-default p-2 text-xs"
        >{{ JSON.stringify(props.preview, null, 2) }}</pre>
    </details>
  </div>
</template>
