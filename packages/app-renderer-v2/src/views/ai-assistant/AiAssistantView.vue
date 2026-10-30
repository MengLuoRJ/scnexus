<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { ERRORS, type IpcResult } from '@scnexus/app-shared/errors/app.error'
import type { SettingSnapshot } from '@scnexus/app-shared/types/desktop.type'
import { useContentCenterStore } from '../../stores/content-center'
import { useAiAssistantStore } from '../../stores/ai-assistant'
import {
  ipcAiAssistantStart,
  ipcAiAssistantStop,
  ipcAiAssistantRegenerateToken,
  ipcAiAssistantGetConnectionInfo,
  ipcSettingGetSnapshot,
  ipcSettingUpdate,
  ipcSettingOnChanged,
} from '../../ipcs'

defineOptions({ name: 'AiAssistantView' })
const { t, te } = useI18n()
const toast = useToast()
const center = useContentCenterStore()
const assistant = useAiAssistantStore()
const port = ref('17861')
const busy = ref(false)
const token = ref('')
const rotateOpen = ref(false)
const tab = ref('configuration')
const tabs = computed(() => [
  { label: t('aiAssistant.configuration'), value: 'configuration', slot: 'configuration' as const },
  { label: t('aiAssistant.capabilities'), value: 'capabilities', slot: 'capabilities' as const },
  { label: t('aiAssistant.history'), value: 'history', slot: 'history' as const },
])
type ApprovalKey =
  | 'aiAutoApproveSwitchCampaign'
  | 'aiAutoApproveRestoreCampaign'
  | 'aiAutoApproveUninstallCampaign'
const approvals = ref<Record<ApprovalKey, boolean>>({
  aiAutoApproveSwitchCampaign: false,
  aiAutoApproveRestoreCampaign: false,
  aiAutoApproveUninstallCampaign: false,
})
const preferencesLoading = ref(true)
let preferencesRevision = 0
let disposeSettings: (() => void) | undefined
const tools: {
  name: string
  limit: string
  access: string
  approval?: ApprovalKey
}[] = [
  { name: 'get_app_status', limit: 'noParameters', access: 'read' },
  { name: 'list_campaigns', limit: 'pagination', access: 'read' },
  { name: 'get_campaign_details', limit: 'identifier', access: 'read' },
  { name: 'list_custom_content', limit: 'pagination', access: 'read' },
  { name: 'list_downloads', limit: 'pagination', access: 'read' },
  { name: 'get_task_status', limit: 'identifier', access: 'read' },
  { name: 'activate_campaign', limit: 'identifier', access: 'action' },
  {
    name: 'switch_campaign',
    limit: 'identifier',
    access: 'action',
    approval: 'aiAutoApproveSwitchCampaign',
  },
  {
    name: 'restore_campaign',
    limit: 'identifier',
    access: 'confirmation',
    approval: 'aiAutoApproveRestoreCampaign',
  },
  {
    name: 'uninstall_campaign',
    limit: 'identifier',
    access: 'confirmation',
    approval: 'aiAutoApproveUninstallCampaign',
  },
  { name: 'list_mutators', limit: 'mutators', access: 'read' },
  { name: 'get_weekly_mutation', limit: 'weeklyMutation', access: 'read' },
]
const stopped = computed(() => ['stopped', 'error'].includes(assistant.status.state))
const running = computed(() => assistant.status.state === 'running')
const validPort = computed(
  () =>
    Number.isInteger(Number(port.value)) &&
    Number(port.value) >= 1024 &&
    Number(port.value) <= 65535,
)
const history = computed(() => [...assistant.records].reverse())
let dispose: (() => void) | undefined
let disposed = false
let credentialGeneration = 0
function forgetCredentials() {
  credentialGeneration++
  token.value = ''
}
const safeErrors = new Set([
  'AI_ASSISTANT_DISABLED',
  'AI_ASSISTANT_INVALID_PORT',
  'AI_ASSISTANT_NOT_RUNNING',
  'AI_ASSISTANT_PORT_IN_USE',
  'AI_ASSISTANT_START_FAILED',
])
function failure(code?: string) {
  const key = `aiAssistant.error.${safeErrors.has(code ?? '') ? code : 'generic'}`
  toast.add({
    color: 'error',
    title: t('ui.error'),
    description: t(te(key) ? key : 'aiAssistant.error.generic'),
  })
}
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  try {
    await action()
  } catch {
    failure()
  } finally {
    busy.value = false
  }
}
function accept<T>(result: IpcResult<T>): T | undefined {
  if (!result.ok) {
    failure(result.error.message)
    return
  }
  return result.data
}
function applyPreferences(settings: SettingSnapshot) {
  if (disposed) return
  preferencesRevision++
  for (const key of Object.keys(approvals.value) as ApprovalKey[]) {
    approvals.value[key] = settings[key] === true
  }
  preferencesLoading.value = false
}
async function refreshPreferences() {
  const revision = preferencesRevision
  preferencesLoading.value = true
  try {
    const result = await ipcSettingGetSnapshot()
    if (disposed || revision !== preferencesRevision) return
    if (result.ok) {
      applyPreferences(result.data)
      port.value = String(result.data.aiAssistantPort ?? 17861)
    } else {
      toast.add({ color: 'error', title: t('aiAssistant.autoApprove.error') })
    }
  } catch {
    if (!disposed) toast.add({ color: 'error', title: t('aiAssistant.autoApprove.error') })
  }
}
async function updateApproval(key: ApprovalKey, enabled: boolean) {
  if (!center.aiAssistantEnabled || preferencesLoading.value || busy.value) return
  await run(async () => {
    try {
      const result = await ipcSettingUpdate({ [key]: enabled })
      if (disposed) return
      if (result.ok) {
        applyPreferences(result.data)
        return
      }
      if (result.error.code !== ERRORS.TASK_CANCELLED.code) {
        toast.add({ color: 'error', title: t('aiAssistant.autoApprove.error') })
      }
    } catch {
      if (disposed) return
      toast.add({ color: 'error', title: t('aiAssistant.autoApprove.error') })
    }
    // A failed write may have saved part of the preferences before returning an error.
    await refreshPreferences()
  })
}
async function start() {
  if (!validPort.value || !stopped.value) return
  await run(async () => {
    const saved = await ipcSettingUpdate({ aiAssistantPort: Number(port.value) })
    if (!saved.ok) {
      failure(saved.error.message)
      return
    }
    if (disposed || !center.aiAssistantEnabled) return
    center.accept(saved.data)
    const result = await ipcAiAssistantStart(Number(port.value))
    if (!result.ok) failure(result.error.message)
    else if (!disposed && center.aiAssistantEnabled) assistant.status = result.data
  })
}
async function stop() {
  await run(async () => {
    const result = await ipcAiAssistantStop()
    if (!result.ok) failure(result.error.message)
    else if (!disposed) {
      assistant.status = result.data
      forgetCredentials()
    }
  })
}
async function connection(action: 'show' | 'copy' | 'config') {
  if (!running.value || !center.aiAssistantEnabled) return
  const generation = credentialGeneration
  await run(async () => {
    const value = accept(await ipcAiAssistantGetConnectionInfo())
    if (
      !value ||
      disposed ||
      generation !== credentialGeneration ||
      !running.value ||
      !center.aiAssistantEnabled
    )
      return
    if (action === 'show') token.value = value.token
    else {
      const text =
        action === 'config'
          ? JSON.stringify(
              {
                mcpServers: {
                  scnexus: {
                    type: 'http',
                    url: value.url,
                    headers: { Authorization: `Bearer ${value.token}` },
                  },
                },
              },
              null,
              2,
            )
          : value.token
      await navigator.clipboard.writeText(text)
      toast.add({ color: 'success', title: t('aiAssistant.copied') })
    }
  })
}
async function rotate() {
  rotateOpen.value = false
  forgetCredentials()
  await run(async () => {
    const result = await ipcAiAssistantRegenerateToken()
    if (!result.ok) failure(result.error.message)
    else toast.add({ color: 'success', title: t('aiAssistant.rotated') })
  })
}
function toolLabel(name: string) {
  const key = `aiAssistant.tool.${name}`
  return t(te(key) ? key : 'aiAssistant.tool.unknown')
}
watch(
  tab,
  () => {
    if (tab.value !== 'configuration') {
      forgetCredentials()
      rotateOpen.value = false
    }
  },
  { flush: 'sync' },
)
watch(
  () => [center.aiAssistantEnabled, assistant.status.state],
  () => {
    if (!center.aiAssistantEnabled || !running.value) forgetCredentials()
  },
  { flush: 'sync' },
)
watch(
  () => center.aiAssistantEnabled,
  (enabled) => {
    if (!enabled) {
      dispose?.()
      dispose = undefined
    } else void initialize()
  },
)
async function initialize() {
  if (!center.aiAssistantEnabled || dispose || !window.scnexus) return
  dispose = assistant.subscribe()
  await refreshPreferences()
  if (disposed || !center.aiAssistantEnabled) return
  const result = await assistant.refresh()
  if (!result.ok) failure(result.error.message)
}
onMounted(() => {
  if (window.scnexus) disposeSettings = ipcSettingOnChanged(applyPreferences)
  void run(async () => {
    await center.initialize()
    if (!center.aiAssistantEnabled || disposed) return
    await initialize()
  })
})
onUnmounted(() => {
  disposed = true
  dispose?.()
  disposeSettings?.()
  forgetCredentials()
})
</script>

<template>
  <div class="min-w-0 space-y-3">
    <UAlert v-if="!center.aiAssistantEnabled" color="warning" :title="t('aiAssistant.disabled')" />
    <UTabs v-else v-model="tab" :items="tabs" size="sm" class="w-full min-w-0">
      <template #configuration>
        <div class="space-y-3">
          <UAlert
            color="info"
            :title="t('aiAssistant.readOnly')"
            :description="t('aiAssistant.security')" />
          <UCard :ui="{ body: 'space-y-3 p-3 sm:p-3' }">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-sm font-semibold">{{ t('aiAssistant.service') }}</h2>
              <UBadge :color="running ? 'success' : 'neutral'" variant="subtle">
                {{ t(`aiAssistant.state.${assistant.status.state}`) }}
              </UBadge>
            </div>
            <div class="flex items-end gap-3">
              <UFormField
                :label="t('aiAssistant.port')"
                :error="!validPort ? t('aiAssistant.invalidPort') : undefined">
                <UInput
                  v-model="port"
                  type="number"
                  :min="1024"
                  :max="65535"
                  :disabled="!stopped || busy"
                  class="w-28" />
              </UFormField>
              <UButton v-if="stopped" :disabled="busy || !validPort" @click="start">
                {{ t('aiAssistant.start') }}
              </UButton>
              <UButton v-else :disabled="busy || !running" color="neutral" @click="stop">
                {{ t('aiAssistant.stop') }}
              </UButton>
            </div>
            <div class="min-w-0 space-y-1 text-xs">
              <p class="text-muted">{{ t('aiAssistant.endpoint') }}</p>
              <code class="block break-all">
                http://127.0.0.1:{{ running ? assistant.status.port : port }}/mcp
              </code>
            </div>
            <UAlert
              v-if="assistant.status.errorCode"
              color="error"
              :title="
                t(
                  te(`aiAssistant.error.${assistant.status.errorCode}`)
                    ? `aiAssistant.error.${assistant.status.errorCode}`
                    : 'aiAssistant.error.generic',
                )
              " />
          </UCard>
          <UCard :ui="{ body: 'space-y-3 p-3 sm:p-3' }">
            <div class="space-y-1">
              <h2 class="text-sm font-semibold">{{ t('aiAssistant.authentication') }}</h2>
              <p class="text-xs text-muted">{{ t('aiAssistant.tokenHelp') }}</p>
            </div>
            <div class="flex items-center gap-2">
              <UInput
                :model-value="token || '••••••••••••••••'"
                readonly
                :aria-label="t('aiAssistant.token')"
                class="min-w-0 flex-1" />
              <UButton
                :disabled="!running || busy"
                color="neutral"
                variant="outline"
                @click="token ? forgetCredentials() : connection('show')">
                {{ t(token ? 'aiAssistant.hide' : 'aiAssistant.show') }}
              </UButton>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                :disabled="!running || busy"
                color="neutral"
                variant="outline"
                @click="connection('copy')">
                {{ t('aiAssistant.copy') }}
              </UButton>
              <UButton
                :disabled="!running || busy"
                color="neutral"
                variant="outline"
                @click="connection('config')">
                {{ t('aiAssistant.config') }}
              </UButton>
              <UButton
                :disabled="!running || busy"
                color="warning"
                variant="outline"
                @click="rotateOpen = true">
                {{ t('aiAssistant.rotate') }}
              </UButton>
            </div>
          </UCard>
        </div>
      </template>
      <template #history>
        <section class="min-w-0 space-y-2">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">{{ t('aiAssistant.history') }}</h2>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :disabled="busy || !history.length"
              @click="
                run(async () => {
                  accept(await assistant.clearRecords())
                })
              ">
              {{ t('aiAssistant.clear') }}
            </UButton>
          </div>
          <p class="text-xs text-muted">{{ t('aiAssistant.historyHelp') }}</p>
          <p v-if="!history.length" class="py-4 text-sm text-muted">{{ t('aiAssistant.empty') }}</p>
          <div v-else class="max-h-56 overflow-y-auto rounded-md border border-default">
            <div
              v-for="record in history"
              :key="record.id"
              class="flex items-center gap-3 border-b border-default p-2 text-xs last:border-0">
              <span class="min-w-0 flex-1 truncate">{{ toolLabel(record.toolName) }}</span>
              <span>{{ t(`aiAssistant.record.${record.status}`) }}</span>
              <time>{{ new Date(record.startedAt).toLocaleTimeString() }}</time>
              <span v-if="record.finishedAt">
                {{ Math.max(0, record.finishedAt - record.startedAt) }} ms
              </span>
            </div>
          </div>
        </section>
      </template>
      <template #capabilities>
        <section class="min-w-0 space-y-3">
          <UAlert
            color="info"
            :title="t('aiAssistant.readOnly')"
            :description="t('aiAssistant.capabilitiesSafety')" />
          <p class="text-xs text-muted">{{ t('aiAssistant.mutationData') }}</p>
          <div class="grid max-h-[calc(100vh-19rem)] grid-cols-2 gap-2 overflow-y-auto">
            <UCard
              v-for="tool in tools"
              :key="tool.name"
              class="min-w-0"
              :ui="{ body: 'space-y-1.5 p-3 sm:p-3' }">
              <div class="flex flex-wrap items-center justify-between gap-1">
                <h2 class="text-sm font-semibold">{{ toolLabel(tool.name) }}</h2>
                <UBadge
                  :color="tool.access === 'read' ? 'neutral' : 'warning'"
                  size="sm"
                  variant="subtle"
                  :data-access="tool.access">
                  {{
                    t(
                      `aiAssistant.access.${tool.approval && approvals[tool.approval] ? 'automatic' : tool.access}`,
                    )
                  }}
                </UBadge>
              </div>
              <code class="block break-all text-xs text-muted">{{ tool.name }}</code>
              <p class="text-xs">{{ t(`aiAssistant.description.${tool.name}`) }}</p>
              <p class="text-xs break-words text-muted">
                {{ t(`aiAssistant.limit.${tool.limit}`) }}
              </p>
              <div v-if="tool.approval" class="space-y-1 border-t border-default pt-2">
                <USwitch
                  :model-value="approvals[tool.approval]"
                  :disabled="busy || preferencesLoading || !center.aiAssistantEnabled"
                  :label="t('aiAssistant.autoApprove.label')"
                  :aria-label="`${toolLabel(tool.name)}: ${t('aiAssistant.autoApprove.label')}`"
                  :data-approval="tool.approval"
                  size="sm"
                  @update:model-value="updateApproval(tool.approval, $event)" />
                <p class="text-xs text-muted">{{ t(`aiAssistant.autoApprove.${tool.name}`) }}</p>
              </div>
            </UCard>
          </div>
        </section>
      </template>
    </UTabs>
    <UModal
      v-if="center.aiAssistantEnabled"
      v-model:open="rotateOpen"
      :title="t('aiAssistant.rotate')"
      :description="t('aiAssistant.rotateWarning')">
      <template #body>
        <p>{{ t('aiAssistant.rotateWarning') }}</p>
      </template>
      <template #footer>
        <UButton color="neutral" @click="rotateOpen = false">{{ t('ui.cancel') }}</UButton>
        <UButton color="warning" :disabled="busy" @click="rotate">
          {{ t('aiAssistant.rotate') }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
