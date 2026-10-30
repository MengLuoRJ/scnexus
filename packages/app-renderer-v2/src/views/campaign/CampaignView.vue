<script lang="ts" setup>
import { computed, onMounted, ref, watch, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ContentImportDialog from '../../components/content/ContentImportDialog.vue'
import { useContentImportStore } from '../../stores/content-import'
import { useToast } from '@nuxt/ui/composables/useToast'
import { normalizeError, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { AppErrorDto } from '@scnexus/app-shared/errors/app.error'
import type {
  ContentRecord,
  PackageCampaignType,
  AnalysisResult,
} from '@scnexus/app-shared/types/content.type'
import {
  ipcCampaignLaunch,
  ipcShellOpenExternalWebsite,
  ipcShellShowItemInFolder,
} from '../../ipcs'
import { useCampaign } from './useCampaign'
import type { CampaignOperationRequest } from './useCampaign'
import CampaignOverview from './components/CampaignOverview.vue'
import CampaignManagement from './components/CampaignManagement.vue'
import CampaignDetails from './components/CampaignDetails.vue'
import CampaignSourcePicker from './components/CampaignSourcePicker.vue'
import CampaignLibraryModal from './components/CampaignLibraryModal.vue'
import CampaignInstallModal from './components/CampaignInstallModal.vue'
import CampaignOperationModal from './components/CampaignOperationModal.vue'
defineOptions({ name: 'CampaignView' })
const { t } = useI18n()
const toast = useToast()
const importStore = useContentImportStore()
const refContentImport = useTemplateRef('refContentImport')
const service = useCampaign()
const { diagnostics, records, active, busy, error, warnings } = service
const available = Boolean(window.scnexus)
const headerReady = ref(false)
const chooserOpen = ref(false)
const installOpen = ref(false)
const viewMode = ref('overview')
const category = ref<PackageCampaignType>('WOL')
const operation = ref<CampaignOperationRequest | null>(null)
const locked = computed(
  () =>
    busy.value ||
    importStore.busy ||
    Boolean(importStore.conflict) ||
    installOpen.value ||
    Boolean(operation.value),
)
const current = computed(
  () =>
    records.value.find((record) => record.localId === active.value[category.value]?.localId) ??
    null,
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
function manageCategory(value: PackageCampaignType) {
  category.value = value
  chooserOpen.value = true
}
function operate(record: ContentRecord, action: CampaignOperationRequest['action']) {
  if (locked.value) return
  chooserOpen.value = false
  operation.value = { record, action }
}
function analyzed(result: AnalysisResult) {
  if (service.acceptAnalysis(result)) installOpen.value = true
}
async function external(run: () => Promise<{ ok: boolean; error?: AppErrorDto }>) {
  try {
    const result = await run()
    if (!result.ok && result.error) notifyError(result.error)
    return result.ok
  } catch (value) {
    notifyError(toErrorDto(normalizeError(value)))
  }
}
async function launch() {
  if (locked.value) return
  busy.value = true
  try {
    if (await external(ipcCampaignLaunch))
      toast.add({ color: 'success', title: t('campaign.battleNetStarted'), duration: 8000 })
  } finally {
    busy.value = false
  }
}
function showFolder(record: ContentRecord) {
  void external(() => ipcShellShowItemInFolder(record.descriptorPath))
}
function openWebsite(url: string) {
  void external(() => ipcShellOpenExternalWebsite(url))
}
function completed(action: CampaignOperationRequest['action']) {
  toast.add({ color: 'success', title: t(`campaign.${action}Complete`) })
}
async function refresh(scan = false) {
  await (scan ? service.scan() : service.refresh())
  if (!error.value)
    toast.add({
      color: 'success',
      title: t(scan ? 'campaign.scanComplete' : 'campaign.refreshComplete'),
    })
}
onMounted(() => {
  headerReady.value = true
  if (available) void service.refresh()
})
</script>
<template>
  <div class="space-y-2">
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
      <UTabs
        size="xs"
        v-model="viewMode"
        :items="[
          { label: t('campaign.overview'), value: 'overview' },
          { label: t('campaign.detailMode'), value: 'detail' },
          { label: t('campaign.libraryManagement'), value: 'management' },
        ]"
        :content="false" />
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
    <CampaignOverview
      v-if="viewMode === 'overview'"
      :records="records"
      :active="active"
      :busy="locked || !available"
      @manage="manageCategory"
      @deactivate="(record) => operate(record, 'deactivate')"
      @uninstall="(record) => operate(record, 'uninstall')" />
    <CampaignDetails
      v-else-if="viewMode === 'detail'"
      v-model="category"
      :current="current"
      :busy="locked"
      :available="available"
      @manage="manageCategory"
      @operate="operate"
      @launch="launch"
      @folder="showFolder"
      @website="openWebsite" />
    <CampaignManagement
      v-else
      :records="records"
      :active="active"
      :busy="locked || !available"
      @operate="operate"
      @folder="showFolder" />
    <div v-if="viewMode === 'overview'" class="flex justify-center">
      <UButton
        icon="i-tabler-player-play"
        size="lg"
        class="h-10 px-6"
        :disabled="locked || !available"
        @click="launch">
        {{ t('campaign.start') }}
      </UButton>
    </div>
    <CampaignSourcePicker
      v-if="viewMode !== 'management'"
      :disabled="locked || !available"
      @select="(source) => refContentImport?.analyze(source)"
      @error="notifyError" />
    <CampaignLibraryModal
      v-model:open="chooserOpen"
      :records="records"
      :active="active"
      :category="category"
      :busy="locked"
      @operate="operate"
      @folder="showFolder" />
    <ContentImportDialog ref="refContentImport" content-type="campaign" @analyzed="analyzed" />
    <CampaignInstallModal
      v-model:open="installOpen"
      :service="service"
      @activate="(record) => operate(record, 'activate')" />
    <CampaignOperationModal
      :request="operation"
      :service="service"
      @close="operation = null"
      @completed="completed" />
  </div>
</template>
