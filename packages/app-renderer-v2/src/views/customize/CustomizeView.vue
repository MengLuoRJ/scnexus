<script lang="ts" setup>
import { computed, onMounted, ref, watch, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ContentImportDialog from '../../components/content/ContentImportDialog.vue'
import { useContentImportStore } from '../../stores/content-import'
import { useToast } from '@nuxt/ui/composables/useToast'
import { normalizeError, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { AppErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { ContentRecord, AnalysisResult } from '@scnexus/app-shared/types/content.type'
import { apiShellShowItemInFolder } from '../../ipcs'
import { useCustomize } from './useCustomize'
import { formatFileSize } from '../campaign/formatFileSize'
import CampaignSourcePicker from '../campaign/components/CampaignSourcePicker.vue'
import CampaignInstallModal from '../campaign/components/CampaignInstallModal.vue'
import FileTree from '../campaign/components/FileTree.vue'
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
const selected = ref<ContentRecord | null>(null)
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
async function folder(record: ContentRecord) {
  try {
    const result = await apiShellShowItemInFolder(record.descriptorPath)
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
    <Teleport v-if="headerReady" to="#page-actions"
      ><UButton
        icon="i-tabler-refresh"
        size="sm"
        color="neutral"
        variant="ghost"
        :disabled="locked || !available"
        @click="refresh()"
        >{{ t('campaign.refresh') }}</UButton
      ><UButton
        icon="i-tabler-database-search"
        size="sm"
        color="neutral"
        variant="ghost"
        :disabled="locked || !available"
        @click="refresh(true)"
        >{{ t('campaign.scan') }}</UButton
      ></Teleport
    >
    <p class="text-sm text-muted">{{ t('customize.directInstall') }}</p>
    <CampaignSourcePicker
      :disabled="locked || !available"
      @select="(source) => refContentImport?.analyze(source)"
      @error="notifyError"
    />
    <UAlert v-if="!records.length" color="neutral" variant="subtle" :title="t('customize.empty')" />
    <div class="grid gap-3 sm:grid-cols-2">
      <UCard
        v-for="record in records"
        :key="record.localId"
        class="min-w-0"
        :ui="{ body: 'space-y-2 p-3 sm:p-3' }"
      >
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="min-w-0 flex-1 break-words font-semibold">{{ record.package.name }}</h2>
          <UBadge variant="subtle" color="neutral">{{
            record.origin === 'auto-detected' ? t('campaign.auto') : 'SCNexus'
          }}</UBadge>
        </div>
        <p class="break-words text-sm text-muted">
          {{ t('campaign.author') }}: {{ record.package.author || '—' }} ·
          {{ t('campaign.version') }}: {{ record.package.version || '—' }}
        </p>
        <p class="text-sm">
          {{ record.fileCount }} {{ t('campaign.files') }} · {{ formatFileSize(record.bytes) }}
        </p>
        <p
          v-if="record.package.description"
          class="line-clamp-3 break-words whitespace-pre-wrap text-sm text-muted"
        >
          {{ record.package.description }}
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-tabler-info-circle"
            color="neutral"
            variant="outline"
            :disabled="locked"
            @click="selected = record"
            >{{ t('campaign.details') }}</UButton
          ><UButton
            icon="i-tabler-trash"
            color="error"
            variant="soft"
            :disabled="locked || !available"
            @click="uninstall = record"
            >{{ t('campaign.uninstall') }}</UButton
          >
        </div>
      </UCard>
    </div>
    <ContentImportDialog ref="refContentImport" content-type="customize" @analyzed="analyzed" />
    <CampaignInstallModal v-model:open="installOpen" :service="service" content-type="customize" />
    <CustomizeUninstallModal
      :service="service"
      :record="uninstall"
      @close="uninstall = null"
      @completed="toast.add({ color: 'success', title: t('customize.uninstallComplete') })"
    />
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
          if (!value) selected = null
        }
      "
      ><template #body
        ><div v-if="selected" class="space-y-3 text-sm">
          <p class="whitespace-pre-wrap">{{ selected.package.description }}</p>
          <p>
            {{ selected.fileCount }} {{ t('campaign.files') }} ·
            {{ formatFileSize(selected.bytes) }}
          </p>
          <p class="break-all">{{ selected.managementDirectory }}</p>
          <UButton
            icon="i-tabler-folder"
            color="neutral"
            variant="outline"
            @click="folder(selected)"
            >{{ t('campaign.openFolder') }}</UButton
          ><FileTree :tree="selected.targetTree" /></div></template
    ></UModal>
  </div>
</template>
