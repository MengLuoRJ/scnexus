<script lang="ts" setup>
import { computed, onMounted, ref, watch, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { countRecognizedFiles } from '@scnexus/app-shared/utils/content-files'
import ContentImportDialog from '../../components/content/ContentImportDialog.vue'
import { useContentImportStore } from '../../stores/content-import'
import { useToast } from '@nuxt/ui/composables/useToast'
import { normalizeError, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { AppErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { ContentRecord, AnalysisResult } from '@scnexus/app-shared/types/content.type'
import { ipcShellShowItemInFolder } from '../../ipcs'
import { useCustomize } from './useCustomize'
import { formatFileSize } from '../campaign/formatFileSize'
import CampaignSourcePicker from '../campaign/components/CampaignSourcePicker.vue'
import CampaignInstallModal from '../campaign/components/CampaignInstallModal.vue'
import RecordDetails from '../../components/content/RecordDetails.vue'
import PackageImage from '../../components/content/PackageImage.vue'
import { resourcePath } from '@scnexus/app-shared/utils/content-files'
import CustomizeUninstallModal from './components/CustomizeUninstallModal.vue'
defineOptions({ name: 'CustomizeView' })
const { t } = useI18n()
const toast = useToast()
const importStore = useContentImportStore()
const refContentImport = useTemplateRef('refContentImport')
const service = useCustomize()
const { records, busy, error, warnings, diagnostics } = service
const available = Boolean(window.scnexus)
const headerReady = ref(false)
const installOpen = ref(false)
const uninstall = ref<ContentRecord | null>(null)
const selectedId = ref<string | null>(null)
const selected = computed(() => records.value.find((record) => record.localId === selectedId.value))
const launcherChoice = ref('__none__')
const launcherItems = computed(() => [
  { label: t('customize.launcherNone'), value: '__none__' },
  ...[
    ...new Set(
      (selected.value?.installedFiles ?? [])
        .filter((file) => file.type === 'map')
        .map((file) => resourcePath(file.target)),
    ),
  ].map((value) => ({ label: value, value })),
])
watch(
  () => selected.value,
  (record) => {
    launcherChoice.value = record?.launcherTarget ?? '__none__'
  },
)
async function saveLauncher() {
  if (!selected.value) return
  if (
    await service.setLauncher(
      selected.value,
      launcherChoice.value === '__none__' ? null : launcherChoice.value,
    )
  )
    toast.add({ color: 'success', title: t('customize.launcherSaved') })
}
const locked = computed(
  () =>
    busy.value ||
    importStore.busy ||
    Boolean(importStore.conflict) ||
    installOpen.value ||
    Boolean(uninstall.value),
)
function notifyError(value: AppErrorDto) {
  toast.add({
    color: 'error',
    title: `${t('ui.error')} · ${value.code}`,
    description: `${value.description}${value.message ? ` · ${value.message}` : ''} · ${value.errorId}`,
  })
}
watch(error, (value) => {
  if (value) notifyError(value)
})
watch(warnings, (values) => {
  for (const value of values)
    toast.add({
      id: value.errorId,
      color: 'warning',
      title: `${t('ui.warning')} · ${value.code}`,
      description: `${value.description}${value.message ? ` · ${value.message}` : ''} · ${value.errorId}`,
      duration: 10000,
    })
})
function analyzed(result: AnalysisResult) {
  if (service.acceptAnalysis(result)) installOpen.value = true
}
async function refresh(scan = false) {
  await (scan ? service.scan() : service.refresh())
  if (!error.value)
    toast.add({
      color: 'success',
      title: t(scan ? 'customize.scanComplete' : 'customize.refreshComplete'),
    })
}
async function launch(record: ContentRecord) {
  if (await service.launch(record))
    toast.add({ color: 'success', title: t('customize.launchStarted') })
}
async function folder(record: ContentRecord) {
  try {
    const result = await ipcShellShowItemInFolder(record.descriptorPath)
    if (!result.ok) notifyError(result.error)
  } catch (value) {
    notifyError(toErrorDto(normalizeError(value)))
  }
}
onMounted(() => {
  headerReady.value = true
  if (available) void service.refresh()
})
</script>
<template>
  <div class="space-y-3">
    <UAlert v-if="!available" color="warning" :title="t('ui.desktopOnly')" />
    <UButton
      v-if="error?.code === 'M011' || error?.code === 'M013'"
      to="/settings"
      color="neutral"
      variant="outline">
      {{ t('ui.start') }}
    </UButton>
    <UAlert
      v-for="item in diagnostics"
      :key="item.path"
      color="warning"
      :title="item.message"
      :description="item.path" />
    <Teleport v-if="headerReady" to="#page-actions">
      <UButton
        icon="i-tabler-refresh"
        size="sm"
        color="neutral"
        variant="ghost"
        :disabled="locked || !available"
        @click="refresh()">
        {{ t('campaign.refresh') }}
      </UButton>
      <UButton
        icon="i-tabler-database-search"
        size="sm"
        color="neutral"
        variant="ghost"
        :disabled="locked || !available"
        @click="refresh(true)">
        {{ t('campaign.scan') }}
      </UButton>
    </Teleport>
    <p class="text-sm text-muted">{{ t('customize.directInstall') }}</p>
    <CampaignSourcePicker
      :disabled="locked || !available"
      @select="(source) => refContentImport?.analyze(source)"
      @error="notifyError" />
    <UAlert v-if="!records.length" color="neutral" variant="subtle" :title="t('customize.empty')" />
    <div class="grid grid-cols-2 gap-3">
      <UCard
        v-for="record in records"
        :key="record.localId"
        class="min-w-0"
        :ui="{ body: 'space-y-2 p-3 sm:p-3' }">
        <div class="h-28 overflow-hidden rounded">
          <PackageImage :local-id="record.localId" :alt="record.package.name" />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="min-w-0 flex-1 break-words font-semibold">{{ record.package.name }}</h2>
          <UBadge variant="subtle" color="neutral">
            {{ record.origin === 'auto-detected' ? t('campaign.auto') : 'SCNexus' }}
          </UBadge>
        </div>
        <p class="break-words text-sm text-muted">
          {{ t('campaign.author') }}: {{ record.package.author || '—' }} ·
          {{ t('campaign.version') }}: {{ record.package.version || '—' }}
        </p>
        <p class="text-sm">
          {{ t('campaign.standardFiles') }}: {{ record.fileCount }} ·
          {{ t('campaign.recognizedFiles') }}: {{ countRecognizedFiles(record.files) }} ·
          {{ formatFileSize(record.bytes) }}
        </p>
        <p
          v-if="record.package.description"
          class="line-clamp-3 break-words whitespace-pre-wrap text-sm text-muted">
          {{ record.package.description }}
        </p>
        <p v-if="record.launcherTarget" class="break-all text-xs text-muted">
          {{ t('customize.launcher') }}: {{ record.launcherTarget }}
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton
            :disabled="locked || !available || !record.launcherTarget"
            @click="launch(record)">
            {{ t('customize.launch') }}
          </UButton>
          <UButton
            icon="i-tabler-info-circle"
            color="neutral"
            variant="outline"
            :disabled="locked"
            @click="selectedId = record.localId">
            {{ t('campaign.details') }}
          </UButton>
          <UButton
            icon="i-tabler-trash"
            color="error"
            variant="soft"
            :disabled="locked || !available"
            @click="uninstall = record">
            {{ t('campaign.uninstall') }}
          </UButton>
        </div>
      </UCard>
    </div>
    <ContentImportDialog ref="refContentImport" content-type="customize" @analyzed="analyzed" />
    <CampaignInstallModal v-model:open="installOpen" :service="service" content-type="customize" />
    <CustomizeUninstallModal
      :service="service"
      :record="uninstall"
      @close="uninstall = null"
      @completed="toast.add({ color: 'success', title: t('customize.uninstallComplete') })" />
    <UModal
      :open="Boolean(selected)"
      :title="selected?.package.name"
      :ui="{
        content: 'sm:max-w-3xl',
        title: 'min-w-0 break-words',
        body: 'min-h-0 break-words p-4 sm:p-4',
      }"
      @update:open="
        (value: boolean) => {
          if (!value) selectedId = null
        }
      ">
      <template #body>
        <RecordDetails v-if="selected" :record="selected">
          <div class="space-y-2">
            <p class="text-muted">{{ t('customize.launcher') }}</p>
            <div class="flex gap-2">
              <USelect
                v-model="launcherChoice"
                :items="launcherItems"
                :disabled="busy"
                class="min-w-0 flex-1"
                :aria-label="t('customize.launcher')" />
              <UButton
                :loading="busy"
                :disabled="launcherChoice === (selected.launcherTarget ?? '__none__')"
                @click="saveLauncher">
                {{ t('customize.saveLauncher') }}
              </UButton>
            </div>
          </div>
          <UButton
            icon="i-tabler-folder"
            color="neutral"
            variant="outline"
            @click="folder(selected)">
            {{ t('campaign.openFolder') }}
          </UButton>
        </RecordDetails>
      </template>
    </UModal>
  </div>
</template>
