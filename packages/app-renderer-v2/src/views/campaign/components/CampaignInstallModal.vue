<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { countRecognizedFiles } from '@scnexus/app-shared/utils/content-files'
import { formatFileSize } from '../formatFileSize'
import type {
  ContentRecord,
  ConflictDecision,
  InstallMode,
  ContentType,
} from '@scnexus/app-shared/types/content.type'
import type { useCampaign } from '../useCampaign'
import FileTree from './FileTree.vue'
import { countSourceRecognizedFiles } from '../countSourceRecognizedFiles'
import LauncherChoice from '../../../components/content/LauncherChoice.vue'
import ConflictChoices from './ConflictChoices.vue'
defineOptions({ name: 'CampaignInstallModal' })
type InstallService = Pick<
  ReturnType<typeof useCampaign>,
  | 'analysis'
  | 'preview'
  | 'mode'
  | 'busy'
  | 'error'
  | 'existing'
  | 'conflicts'
  | 'installProgress'
  | 'close'
> & {
  confirm(
    decisions: ConflictDecision[],
    removals: import('@scnexus/app-shared/types/content.type').RemovalDecision[],
    launcherTarget?: string | null,
  ): Promise<{ installed: ContentRecord | null } | undefined>
}
const props = withDefaults(defineProps<{ service: InstallService; contentType?: ContentType }>(), {
  contentType: 'campaign',
})
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ activate: [record: ContentRecord] }>()
const { t, te } = useI18n()
const { analysis, preview, mode, busy, error, existing, conflicts, installProgress } = props.service
const percentage = computed(() => {
  const progress = installProgress.value
  if (!progress || progress.stage === 'preparing') return undefined
  if (progress.stage === 'extracting') return progress.percent
  if (!progress.totalFiles) return undefined
  return Math.floor((progress.completedFiles / progress.totalFiles) * 100)
})
const launcherTarget = ref<string | null>(null)
watch(
  [preview, open],
  () => {
    launcherTarget.value = preview.value?.launcher?.target ?? null
  },
  { immediate: true },
)
const installed = ref<ContentRecord | null>(null)
const installing = ref(false)
const decisions = ref<ConflictDecision[]>([])
const modes = computed(() =>
  (props.contentType === 'campaign' ? ['scnexus', 'ccm', 'auto'] : ['scnexus', 'auto']).map(
    (value) => ({
      label: value === 'auto' ? t('campaign.auto') : value === 'ccm' ? 'CCM' : 'SCNexus',
      value,
      disabled: !analysis.value?.modes[value as InstallMode],
    }),
  ),
)
const canInstall = computed(
  () =>
    Boolean(preview.value) &&
    !existing.value.length &&
    conflicts.value.every((file) =>
      decisions.value.some((item) => item.conflictId === file.conflictId),
    ),
)
const title = computed(() =>
  t(
    installed.value
      ? 'campaign.installComplete'
      : installing.value
        ? 'ui.installing'
        : busy.value
          ? 'campaign.reading'
          : 'campaign.analyze',
  ),
)
watch(open, (value) => {
  if (value) {
    installed.value = null
    installing.value = false
    decisions.value = []
  }
})
watch(
  [mode, analysis, conflicts, open],
  () => {
    decisions.value = conflicts.value.map((file) => ({
      conflictId: file.conflictId,
      action: 'overwrite',
    }))
  },
  { immediate: true },
)
async function install() {
  if (!canInstall.value || busy.value || installing.value) return
  installing.value = true
  const result = await props.service.confirm(
    decisions.value,
    [],
    ...(props.contentType === 'customize' && preview.value?.launcher?.source !== 'manifest'
      ? [launcherTarget.value]
      : []),
  )
  installing.value = false
  if (result?.installed) installed.value = result.installed
}
async function close() {
  if (busy.value) return
  await props.service.close()
  if (!analysis.value) open.value = false
}
function activate() {
  if (!installed.value) return
  open.value = false
  emit('activate', installed.value)
}
</script>
<template>
  <UModal
    :open="open"
    :title="title"
    :dismissible="!busy"
    :close="!busy"
    :ui="{
      content: 'sm:max-w-4xl',
      header: 'shrink-0 p-4 sm:px-4',
      body: 'min-h-0 space-y-4 break-words p-4 sm:p-4',
      footer: 'shrink-0 p-4 sm:px-4',
      title: 'min-w-0 break-words',
    }"
    @update:open="
      (value: boolean) => {
        if (!value) close()
      }
    ">
    <template #body>
      <div v-if="installed" class="space-y-4">
        <UAlert
          color="success"
          icon="i-tabler-circle-check"
          :title="t('campaign.installComplete')"
          :description="
            t(
              props.contentType === 'campaign'
                ? 'campaign.activatePrompt'
                : 'customize.installedHint',
            )
          " />
        <p class="font-semibold">
          {{ installed.package.name }} · {{ installed.package.version || '—' }}
        </p>
        <p>
          {{ t('campaign.standardFiles') }}: {{ installed.fileCount }} ·
          {{ t('campaign.recognizedFiles') }}: {{ countRecognizedFiles(installed.files) }} ·
          {{ formatFileSize(installed.bytes) }} ·
          {{ installed.mode }}
        </p>
        <p class="break-all text-sm text-muted">{{ installed.managementDirectory }}</p>
        <p class="text-sm text-muted">
          {{
            t(
              props.contentType === 'campaign'
                ? 'campaign.libraryInstalled'
                : 'customize.directInstall',
            )
          }}
        </p>
        <p v-if="installed.installedFiles.length" class="text-sm font-medium">
          {{ t('campaign.gameResourceResults') }}
        </p>
        <dl v-if="installed.installedFiles.length" class="grid grid-cols-3 gap-2 text-sm">
          <div v-for="status in ['copied', 'replaced', 'kept'] as const" :key="status">
            <dt class="text-muted">{{ t(`campaign.${status}`) }}</dt>
            <dd>{{ installed.installedFiles.filter((file) => file.result === status).length }}</dd>
          </div>
        </dl>
        <UAlert
          v-if="props.contentType === 'campaign' && !installed.payloadDirectory"
          color="warning"
          :title="t('campaign.activationUnavailable')" />
      </div>
      <div v-else-if="busy" class="space-y-3" role="status" aria-live="polite">
        <p>{{ t(installing ? 'campaign.installingHint' : 'campaign.reading') }}</p>
        <template v-if="installing && installProgress">
          <p>{{ t(`campaign.progress.${installProgress.stage}`) }}</p>
          <UProgress :model-value="percentage" :max="100" />
          <p
            v-if="installProgress.stage === 'extracting' && percentage !== undefined"
            class="text-sm">
            {{ percentage }}%
          </p>
          <p
            v-else-if="
              installProgress.stage !== 'preparing' &&
              installProgress.stage !== 'extracting' &&
              installProgress.totalFiles
            "
            class="text-sm">
            {{ installProgress.completedFiles }} / {{ installProgress.totalFiles }}
            {{ t('campaign.files') }} · {{ percentage ?? 0 }}%
          </p>
          <p v-if="installProgress.currentFile" class="break-all text-xs text-muted">
            {{ installProgress.currentFile }}
          </p>
          <p v-if="installProgress.stage === 'extracting'" class="text-xs text-muted">
            {{ t('campaign.extractionHint') }}
          </p>
          <p v-else-if="installProgress.stage !== 'preparing'" class="text-xs text-muted">
            {{ t('campaign.progressCountHint') }}
          </p>
        </template>
        <UProgress v-else />
      </div>
      <div v-else-if="analysis" class="space-y-4">
        <p class="break-all text-xs text-muted">{{ analysis.source.path }}</p>
        <UTabs v-model="mode" :items="modes" :content="false" />
        <p v-if="analysis.recommendedMode" class="text-xs text-muted">
          {{ t('campaign.recommended') }}: {{ analysis.recommendedMode }}
        </p>
        <UAlert
          v-if="mode === 'auto' && preview"
          color="info"
          :title="t('campaign.autoDetected')"
          :description="
            t(
              props.contentType === 'campaign'
                ? 'campaign.autoDetectedHint'
                : 'customize.autoDetectedHint',
            )
          " />
        <UAlert v-if="mode === 'ccm'" color="warning" :title="t('campaign.ccmWarning')" />
        <UAlert
          v-for="item in existing"
          :key="item.directory"
          color="warning"
          :title="t('campaign.exists')"
          :description="`${item.package?.name || item.diagnostic?.message || ''} · ${item.directory}`" />
        <template v-if="preview">
          <section class="space-y-2">
            <h3 class="font-semibold">{{ t('campaign.basicInfo') }}</h3>
            <dl class="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt class="text-muted">{{ t('campaign.name') }}</dt>
                <dd>{{ preview.package.name }}</dd>
              </div>
              <div>
                <dt class="text-muted">{{ t('campaign.type') }}</dt>
                <dd>
                  {{ preview.package.type }}
                  <template v-if="preview.package.campaign">
                    · {{ t(`campaign.${preview.package.campaign}`) }}
                  </template>
                </dd>
              </div>
              <div>
                <dt class="text-muted">{{ t('campaign.author') }}</dt>
                <dd>{{ preview.package.author || '—' }}</dd>
              </div>
              <div>
                <dt class="text-muted">{{ t('campaign.version') }}</dt>
                <dd>{{ preview.package.version || '—' }}</dd>
              </div>
              <div>
                <dt class="text-muted">SCNID</dt>
                <dd>{{ preview.package.scnid ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-muted">{{ t('campaign.origin') }}</dt>
                <dd>
                  {{ preview.origin === 'auto-detected' ? t('campaign.auto') : preview.origin }}
                </dd>
              </div>
            </dl>
            <p class="whitespace-pre-wrap text-sm">{{ preview.package.description }}</p>
          </section>
          <USeparator />
          <section class="space-y-2 text-sm">
            <h3 class="font-semibold">{{ t('campaign.installFiles') }}</h3>
            <p>
              {{ t('campaign.standardFiles') }}: {{ preview.fileCount }} ·
              {{ t('campaign.recognizedFiles') }}: {{ countRecognizedFiles(preview.files) }} ·
              {{ formatFileSize(preview.bytes) }}
            </p>
            <p>
              {{ t('campaign.sourceStats') }} · {{ t('campaign.standardFiles') }}:
              {{ analysis.sourceStats.fileCount }} · {{ t('campaign.recognizedFiles') }}:
              {{ countSourceRecognizedFiles(analysis.sourceTree) }} ·
              {{ formatFileSize(analysis.sourceStats.bytes) }}
            </p>
            <p v-if="analysis.sourceStats.compressedBytes !== undefined">
              {{ t('campaign.compressedSize') }}:
              {{ formatFileSize(analysis.sourceStats.compressedBytes) }}
            </p>
            <p v-if="preview.descriptorPath" class="break-all text-muted">
              {{ preview.descriptorPath }}
            </p>
          </section>
          <div class="grid gap-4 md:grid-cols-2">
            <section>
              <h3 class="mb-2 font-semibold">{{ t('campaign.sourceTree') }}</h3>
              <div class="max-h-64 overflow-auto rounded border border-default p-2">
                <FileTree :tree="analysis.sourceTree" />
              </div>
            </section>
            <section>
              <h3 class="mb-2 font-semibold">{{ t('campaign.targetTree') }}</h3>
              <div class="max-h-64 overflow-auto rounded border border-default p-2">
                <FileTree :tree="preview.targetTree" />
              </div>
            </section>
          </div>
          <LauncherChoice
            v-if="props.contentType === 'customize'"
            v-model="launcherTarget"
            :preview="preview"
            :disabled="busy || installing" />
          <section class="space-y-2">
            <h3 class="font-semibold">{{ t('campaign.conflicts') }} ({{ conflicts.length }})</h3>
            <p v-if="conflicts.length" class="text-sm text-muted">
              {{ t('campaign.defaultOverwriteHint') }}
            </p>
            <ConflictChoices v-if="conflicts.length" v-model="decisions" :files="conflicts" />
            <p v-else class="text-sm text-muted">{{ t('campaign.noConflicts') }}</p>
          </section>
        </template>
        <UAlert v-else color="warning" :title="t('campaign.modeUnavailable')" />
        <UAlert
          v-for="(diagnostic, index) in analysis.diagnostics.filter(
            (item) => !preview || item.mode === mode,
          )"
          :key="index"
          :color="
            diagnostic.level === 'error'
              ? 'error'
              : diagnostic.level === 'warning'
                ? 'warning'
                : 'info'
          "
          :title="
            props.contentType === 'customize' && diagnostic.code === 'AUTO_DESCRIPTOR_PRESENT'
              ? t('customize.descriptorPresent')
              : te(`campaign.diagnostic.${diagnostic.code}`)
                ? t(`campaign.diagnostic.${diagnostic.code}`)
                : diagnostic.code
          "
          :description="diagnostic.message" />
      </div>
      <UAlert
        v-else-if="error"
        color="error"
        :title="t('ui.error')"
        :description="error.message || error.description" />
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :disabled="busy" @click="close">
          {{ t(installed ? 'campaign.finish' : 'campaign.cancel') }}
        </UButton>
        <UButton
          v-if="installed && props.contentType === 'campaign'"
          :disabled="!installed.payloadDirectory"
          @click="activate">
          {{ t('campaign.activateNow') }}
        </UButton>
        <UButton
          v-else-if="!installed && (analysis || installing)"
          :disabled="!canInstall || busy"
          :loading="installing"
          @click="install">
          {{ t('campaign.confirmInstall') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
