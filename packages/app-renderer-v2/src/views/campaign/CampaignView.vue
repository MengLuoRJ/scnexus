<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { normalizeError, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { AppErrorDto } from '@scnexus/app-shared/errors/app.error'
import type {
  ContentRecord,
  PackageCampaignType,
  SourceInput,
} from '@scnexus/app-shared/types/content.type'
import {
  apiCampaignLaunch,
  apiShellOpenExternalWebsite,
  apiShellShowItemInFolder,
} from '../../ipcs'
import { useCampaign } from './useCampaign'
import type { CampaignOperationRequest } from './useCampaign'
import CampaignOverview from './components/CampaignOverview.vue'
import CampaignDetails from './components/CampaignDetails.vue'
import CampaignSourcePicker from './components/CampaignSourcePicker.vue'
import CampaignLibraryModal from './components/CampaignLibraryModal.vue'
import CampaignInstallModal from './components/CampaignInstallModal.vue'
import CampaignOperationModal from './components/CampaignOperationModal.vue'
defineOptions({ name: 'CampaignView' })
const { t } = useI18n()
const toast = useToast()
const service = useCampaign()
const { diagnostics, records, active, busy, error } = service
const available = Boolean(window.scnexus)
const headerReady = ref(false)
const chooserOpen = ref(false)
const installOpen = ref(false)
const viewMode = ref('overview')
const category = ref<PackageCampaignType>('WOL')
const operation = ref<CampaignOperationRequest | null>(null)
const locked = computed(() => busy.value || installOpen.value || Boolean(operation.value))
const current = computed(
  () =>
    records.value.find((record) => record.localId === active.value[category.value]?.localId) ??
    null,
)
function notifyError(value: AppErrorDto) {
  toast.add({
    color: 'error',
    title: `${t('ui.error')} · ${value.code}`,
    description: `${value.message || value.description} · ${value.errorId}`,
  })
}
watch(error, (value) => {
  if (value) notifyError(value)
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
async function analyze(source: SourceInput) {
  if (locked.value) return
  installOpen.value = true
  await service.analyze(source)
}
async function external(run: () => Promise<{ ok: boolean; error?: AppErrorDto }>) {
  try {
    const result = await run()
    if (!result.ok && result.error) notifyError(result.error)
  } catch (value) {
    notifyError(toErrorDto(normalizeError(value)))
  }
}
async function launch() {
  if (locked.value) return
  busy.value = true
  try {
    await external(apiCampaignLaunch)
  } finally {
    busy.value = false
  }
}
function showFolder(record: ContentRecord) {
  void external(() => apiShellShowItemInFolder(record.descriptorPath))
}
function openWebsite(url: string) {
  void external(() => apiShellOpenExternalWebsite(url))
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
      variant="outline"
      >{{ t('ui.start') }}</UButton
    >
    <UAlert
      v-for="item in diagnostics"
      :key="item.path"
      color="warning"
      :title="item.message"
      :description="item.path"
    />
    <Teleport v-if="headerReady" to="#page-actions">
      <UTabs
        size="xs"
        v-model="viewMode"
        :items="[
          { label: t('campaign.overview'), value: 'overview' },
          { label: t('campaign.detailMode'), value: 'detail' },
        ]"
        :content="false"
      />
      <UButton
        icon="i-tabler-refresh"
        size="sm"
        color="neutral"
        variant="ghost"
        :disabled="locked || !available"
        @click="refresh()"
        >{{ t('campaign.refresh') }}</UButton
      >
      <UButton
        icon="i-tabler-database-search"
        size="sm"
        color="neutral"
        variant="ghost"
        :disabled="locked || !available"
        @click="refresh(true)"
        >{{ t('campaign.scan') }}</UButton
      >
    </Teleport>
    <CampaignOverview
      v-if="viewMode === 'overview'"
      :records="records"
      :active="active"
      :busy="locked || !available"
      @manage="manageCategory"
      @deactivate="(record) => operate(record, 'deactivate')"
      @uninstall="(record) => operate(record, 'uninstall')"
    />
    <CampaignDetails
      v-else
      v-model="category"
      :current="current"
      :busy="locked"
      :available="available"
      @manage="manageCategory"
      @operate="operate"
      @launch="launch"
      @folder="showFolder"
      @website="openWebsite"
    />
    <div v-if="viewMode === 'overview'" class="flex justify-center">
      <UButton
        icon="i-tabler-player-play"
        size="lg"
        class="h-10 px-6"
        :disabled="locked || !available"
        @click="launch"
        >{{ t('campaign.start') }}</UButton
      >
    </div>
    <CampaignSourcePicker :disabled="locked || !available" @select="analyze" @error="notifyError" />
    <CampaignLibraryModal
      v-model:open="chooserOpen"
      :records="records"
      :active="active"
      :category="category"
      :busy="locked"
      @operate="operate"
      @folder="showFolder"
    />
    <CampaignInstallModal
      v-model:open="installOpen"
      :service="service"
      @activate="(record) => operate(record, 'activate')"
    />
    <CampaignOperationModal
      :request="operation"
      :service="service"
      @close="operation = null"
      @completed="completed"
    />
  </div>
</template>
