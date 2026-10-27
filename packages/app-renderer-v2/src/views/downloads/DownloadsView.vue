<script lang="ts" setup>
import { onScopeDispose, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { useWorkshopStore, unwrapWorkshop } from '../../stores/workshop'
import {
  ipcWorkshopPause,
  ipcWorkshopResume,
  ipcWorkshopCancel,
  ipcWorkshopInstallSource,
} from '../../ipcs/workshop'
import { ipcContentAnalyze } from '../../ipcs/content'
import { ipcCampaignInstall, ipcCampaignCancel } from '../../ipcs/campaign'
import { ipcCustomizeInstall } from '../../ipcs/customize'
import {
  ipcDependencyInstall,
  ipcDependencyList,
  ipcDependencyPrepareUninstall,
  ipcDependencyUninstall,
} from '../../ipcs/dependency'
import type {
  AnalysisResult,
  InstallMode,
  ConflictDecision,
  InstallSelection,
  ContentRecord,
} from '@scnexus/app-shared/types/content.type'
import type { RemovalPreview, RemovalDecision } from '@scnexus/app-shared/types/content.type'
import ConflictChoices from '../campaign/components/ConflictChoices.vue'
defineOptions({ name: 'DownloadsView' })
const store = useWorkshopStore()
const { t } = useI18n()
const toast = useToast()
if (window.scnexus) onScopeDispose(store.connect())
const analysis = ref<AnalysisResult | null>(null)
const mode = ref<InstallMode>('scnexus')
const choices = ref<ConflictDecision[]>([])
const busy = ref(false)
const dependencies = ref<ContentRecord[]>([])
const removal = ref<RemovalPreview | null>(null)
const removalChoices = ref<RemovalDecision[]>([])
async function loadDependencies() {
  try {
    dependencies.value = unwrapWorkshop(await ipcDependencyList()).records
  } catch {
    /* A game may not be configured yet. */
  }
}
onMounted(loadDependencies)
async function prepareDependencyRemoval(id: string) {
  try {
    removal.value = unwrapWorkshop(await ipcDependencyPrepareUninstall(id))
    removalChoices.value = []
  } catch {
    toast.add({ color: 'error', title: t('workshop.operationError') })
  }
}
async function removeDependency() {
  if (!removal.value || busy.value) return
  busy.value = true
  try {
    unwrapWorkshop(await ipcDependencyUninstall(removal.value.removalId, removalChoices.value))
    removal.value = null
    await loadDependencies()
    toast.add({ color: 'success', title: t('workshop.dependencyRemoved') })
  } catch {
    toast.add({ color: 'error', title: t('workshop.operationError') })
  } finally {
    busy.value = false
  }
}
async function action(run: () => Promise<unknown>) {
  try {
    await run()
    await store.load()
  } catch {
    toast.add({ color: 'error', title: t('workshop.transferError') })
  }
}
async function install(taskId: string) {
  busy.value = true
  try {
    const source = unwrapWorkshop(await ipcWorkshopInstallSource(taskId))
    analysis.value = unwrapWorkshop(await ipcContentAnalyze(source))
    mode.value = analysis.value.modes.scnexus
      ? 'scnexus'
      : (analysis.value.recommendedMode ?? 'auto')
    choices.value = []
  } catch {
    toast.add({ color: 'error', title: t('workshop.installError') })
  } finally {
    busy.value = false
  }
}
async function close() {
  if (busy.value) return
  if (analysis.value) await ipcCampaignCancel(analysis.value.analysisId)
  analysis.value = null
}
async function confirm() {
  if (!analysis.value || busy.value) return
  busy.value = true
  try {
    const value: InstallSelection = {
      analysisId: analysis.value.analysisId,
      mode: mode.value,
      decisions: choices.value,
    }
    const type = analysis.value.modes[mode.value]?.package.type
    let record: ContentRecord
    if (type === 'dependency') record = unwrapWorkshop(await ipcDependencyInstall(value))
    else if (type === 'campaign') record = unwrapWorkshop(await ipcCampaignInstall(value))
    else record = unwrapWorkshop(await ipcCustomizeInstall(value))
    analysis.value = null
    await loadDependencies()
    toast.add({
      color: 'success',
      title: t('workshop.installed'),
      description: record.package.name,
    })
  } catch {
    toast.add({ color: 'error', title: t('workshop.installError') })
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="space-y-3">
    <p class="text-sm text-muted">{{ t('workshop.downloadManagerHint') }}</p>
    <UButton
      size="sm"
      color="neutral"
      variant="outline"
      :loading="store.loading"
      @click="store.load()"
      >{{ t('workshop.reload') }}</UButton
    >
    <UAlert
      v-if="store.error"
      color="neutral"
      variant="subtle"
      :title="t('workshop.transferError')"
    />
    <UAlert
      v-if="!store.downloads.length && !store.loading"
      color="neutral"
      variant="subtle"
      :title="t('workshop.noDownloads')"
    />
    <article
      v-for="task in store.downloads"
      :key="task.taskId"
      class="space-y-2 rounded border border-default p-3"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="min-w-0 break-all font-medium">{{ task.name }}</span
        ><UBadge variant="subtle">{{ t(`workshop.task.${task.status}`) }}</UBadge>
      </div>
      <UProgress :model-value="task.size ? Math.round((task.transferred / task.size) * 100) : 0" />
      <p class="text-xs text-muted">{{ task.transferred }} / {{ task.size }} bytes</p>
      <p v-if="task.error" class="break-all text-xs text-error">{{ task.error }}</p>
      <div class="flex gap-2">
        <UButton
          v-if="task.status === 'running'"
          size="sm"
          variant="outline"
          @click="action(() => ipcWorkshopPause(task.taskId).then(unwrapWorkshop))"
          >{{ t('workshop.pause') }}</UButton
        >
        <UButton
          v-if="['paused', 'failed'].includes(task.status)"
          size="sm"
          @click="action(() => ipcWorkshopResume(task.taskId).then(unwrapWorkshop))"
          >{{ t('workshop.resume') }}</UButton
        >
        <UButton
          v-if="!['completed', 'cancelled'].includes(task.status)"
          size="sm"
          color="neutral"
          variant="outline"
          @click="action(() => ipcWorkshopCancel(task.taskId).then(unwrapWorkshop))"
          >{{ t('campaign.cancel') }}</UButton
        >
        <UButton
          v-if="task.status === 'completed'"
          size="sm"
          :loading="busy"
          @click="install(task.taskId)"
          >{{ t('workshop.install') }}</UButton
        >
      </div>
    </article>
    <div v-if="dependencies.length" class="space-y-2">
      <h2 class="font-semibold">{{ t('workshop.installedDependencies') }}</h2>
      <div
        v-for="record in dependencies"
        :key="record.localId"
        class="flex items-center justify-between gap-2 rounded border border-default p-2"
      >
        <span class="min-w-0 break-words text-sm"
          >{{ record.package.name }} · {{ record.package.version }}</span
        >
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          @click="prepareDependencyRemoval(record.localId)"
          >{{ t('campaign.uninstall') }}</UButton
        >
      </div>
    </div>
    <UModal
      :open="Boolean(removal)"
      :title="t('campaign.uninstall')"
      :dismissible="!busy"
      @update:open="
        (value: boolean) => {
          if (!value && !busy) removal = null
        }
      "
    >
      <template #body>
        <p class="mb-2 text-sm">{{ t('workshop.dependencyRemovalHint') }}</p>
        <div
          v-for="file in removal?.files ?? []"
          :key="file.conflictId"
          class="space-y-1 rounded border border-warning p-2 text-sm"
        >
          <p class="break-all">{{ file.file.target }}</p>
          <p>{{ file.usedBy.map((item) => item.name).join(', ') }}</p>
          <div class="flex gap-2">
            <UButton
              v-for="action in ['keep', 'delete'] as const"
              :key="action"
              size="sm"
              :variant="
                removalChoices.find((item) => item.conflictId === file.conflictId)?.action ===
                action
                  ? 'solid'
                  : 'outline'
              "
              @click="
                removalChoices = [
                  ...removalChoices.filter((item) => item.conflictId !== file.conflictId),
                  { conflictId: file.conflictId, action },
                ]
              "
              >{{ t(action === 'keep' ? 'campaign.keep' : 'campaign.delete') }}</UButton
            >
          </div>
        </div>
      </template>
      <template #footer
        ><UButton
          :loading="busy"
          :disabled="
            (removal?.files ?? []).some(
              (file) => !removalChoices.some((item) => item.conflictId === file.conflictId),
            )
          "
          @click="removeDependency"
          >{{ t('campaign.confirm') }}</UButton
        ></template
      >
    </UModal>
    <UModal
      :open="Boolean(analysis)"
      :title="t('workshop.install')"
      :dismissible="!busy"
      @update:open="
        (value: boolean) => {
          if (!value) close()
        }
      "
    >
      <template #body>
        <template v-if="analysis">
          <p class="mb-3 font-semibold">{{ analysis.modes[mode]?.package.name }}</p>
          <USelect
            v-model="mode"
            :disabled="busy"
            :items="
              (['scnexus', 'ccm', 'auto'] as const)
                .filter((key) => analysis?.modes[key])
                .map((value) => ({ value, label: value.toUpperCase() }))
            "
            @update:model-value="choices = []"
          />
          <ConflictChoices
            v-model="choices"
            :files="analysis.conflicts.find((item) => item.mode === mode)?.files ?? []"
          />
        </template>
      </template>
      <template #footer
        ><div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="busy" @click="close">{{
            t('campaign.cancel')
          }}</UButton
          ><UButton
            :loading="busy"
            :disabled="
              (analysis?.conflicts.find((item) => item.mode === mode)?.files ?? []).some(
                (file) => !choices.some((item) => item.conflictId === file.conflictId),
              )
            "
            @click="confirm"
            >{{ t('campaign.confirm') }}</UButton
          >
        </div></template
      >
    </UModal>
  </section>
</template>
