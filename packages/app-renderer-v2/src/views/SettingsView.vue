<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { AppError, ERRORS, normalizeError, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import * as desktopIpc from '../ipcs'
import SettingsDirectoryField from './components/SettingsDirectoryField.vue'
import type { GameSnapshot } from '@scnexus/app-shared/types/content-api.type'
import type {
  SettingSnapshot,
  SettingPreferences,
  LogLevel,
} from '@scnexus/app-shared/types/desktop.type'
import type { IpcResult, AppErrorDto } from '@scnexus/app-shared/errors/app.error'
defineOptions({ name: 'SettingsView' })
const { t } = useI18n()
const toast = useToast()
const settings = ref<SettingSnapshot | null>(null)
const game = ref<GameSnapshot | null>(null)
const logDirectory = ref('')
const version = ref('—')
const updater = ref<desktopIpc.UpdaterStatus['state']>('unavailable')
const progress = ref(0)
const busy = ref(false)
const error = ref<AppErrorDto | null>(null)
const available = Boolean(window.scnexus)
watch(error, (value) => {
  if (value)
    toast.add({
      color: 'error',
      title: `${t('ui.error')} · ${value.code}`,
      description: `${value.description}${value.message ? ` · ${value.message}` : ''} · ${value.errorId}`,
    })
})
function notifySaved() {
  toast.add({ color: 'success', title: t('ui.saved') })
}
const languages = computed(() => [
  { label: t('ui.system'), value: 'system' },
  { label: '简体中文', value: 'zh' },
  { label: 'English', value: 'en' },
  { label: '繁體中文', value: 'zh-Hant' },
])
const tabs = computed(() => [
  { label: t('ui.preferences'), value: 'basic', slot: 'basic' },
  { label: t('ui.game'), value: 'game', slot: 'game' },
  { label: t('ui.logging'), value: 'logging', slot: 'logging' },
])
const levels: LogLevel[] = ['error', 'warn', 'info', 'verbose', 'debug', 'silly']
function accept<T>(result: IpcResult<T>): T | undefined {
  if (!result.ok) {
    error.value = result.error
    return
  }
  for (const warning of result.warnings ?? [])
    toast.add({
      id: warning.errorId,
      color: 'warning',
      title: `${t('ui.warning')} · ${warning.code}`,
      description: `${warning.description}${warning.message ? ` · ${warning.message}` : ''} · ${warning.errorId}`,
    })
  return result.data
}
function sync(value: SettingSnapshot) {
  settings.value = value
}
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = null
  try {
    await action()
  } catch (value) {
    error.value = toErrorDto(normalizeError(value))
  } finally {
    busy.value = false
  }
}
async function save(patch: Partial<SettingPreferences>) {
  await run(async () => {
    const result = await desktopIpc.ipcSettingUpdate(patch)
    if (result.ok) {
      sync(accept(result)!)
      notifySaved()
    } else {
      error.value = result.error
      const snapshot = await desktopIpc.ipcSettingGetSnapshot()
      if (snapshot.ok) sync(snapshot.data)
    }
  })
}
async function choose(kind: 'game' | 'download') {
  await run(async () => {
    const picked = accept(
      await desktopIpc.ipcDialogShowOpenDialog({
        properties: ['openDirectory'],
        title: t(kind === 'game' ? 'ui.gameDir' : 'ui.downloadDir'),
      }),
    )
    if (!picked || picked.canceled || !picked.filePaths[0]) return
    if (kind === 'game') {
      const result = await desktopIpc.ipcGameSettingConfigure(picked.filePaths[0])
      if (result.ok) {
        game.value = accept(result)!
        notifySaved()
      } else error.value = result.error
    } else {
      const result = await desktopIpc.ipcSettingUpdate({
        downloadDirectory: picked.filePaths[0],
      })
      if (result.ok) {
        sync(accept(result)!)
        notifySaved()
      } else error.value = result.error
    }
  })
}
async function detect() {
  await run(async () => {
    const result = await desktopIpc.ipcGameSettingInitialize()
    if (result.ok) {
      game.value = accept(result)!
      notifySaved()
    } else {
      error.value = result.error
      const snapshot = await desktopIpc.ipcGameSettingGet()
      if (snapshot.ok) game.value = snapshot.data
    }
  })
}
async function update(action: 'check' | 'download' | 'install') {
  await run(async () => {
    accept(
      await (action === 'check'
        ? desktopIpc.ipcUpdaterCheckForUpdates()
        : action === 'download'
          ? desktopIpc.ipcUpdaterDownloadUpdate()
          : desktopIpc.ipcUpdaterQuitAndInstall()),
    )
    const status = await desktopIpc.ipcUpdaterGetStatus()
    if (status.ok) updater.value = status.data.state
  })
}
function openDirectory(path: string) {
  if (!available || !path) return
  return run(async () => {
    const result = await desktopIpc.ipcShellOpenPath(path)
    const message = accept(result)
    if (result.ok && message)
      error.value = toErrorDto(new AppError(ERRORS.SHELL_OPEN_FAILED, { message }))
  })
}
function openLink(url: string) {
  return run(async () => {
    accept(await desktopIpc.ipcShellOpenExternalWebsite(url))
  })
}
const links = [
  { key: 'website', url: 'https://scnexus.net/' },
  { key: 'terms', url: 'https://scnexus.net/terms.html' },
  { key: 'privacy', url: 'https://scnexus.net/privacy-policy.html' },
  { key: 'community', url: 'https://scnexus.net/guide/#交流社区' },
  { key: 'sponsor', url: 'https://scnexus.net/sponsor.html' },
]
if (available) {
  desktopIpc.ipcSettingOnChanged(sync)
  desktopIpc.ipcUpdaterOnCheckingForUpdate(() => (updater.value = 'checking'))
  desktopIpc.ipcUpdaterOnUpdateAvailable(() => (updater.value = 'available'))
  desktopIpc.ipcUpdaterOnUpdateNotAvailable(() => (updater.value = 'idle'))
  desktopIpc.ipcUpdaterOnDownloadProgress((value) => {
    updater.value = 'downloading'
    progress.value = value.percent
  })
  desktopIpc.ipcUpdaterOnUpdateDownloaded(() => (updater.value = 'downloaded'))
  desktopIpc.ipcUpdaterOnError((value) => {
    updater.value = 'failed'
    error.value = value
  })
}
onMounted(async () => {
  if (!available) return
  await run(async () => {
    const results = await Promise.all([
      desktopIpc.ipcSettingGetSnapshot(),
      desktopIpc.ipcGameSettingGet(),
      desktopIpc.ipcAppGetVersion(),
      desktopIpc.ipcUpdaterGetStatus(),
      desktopIpc.ipcAppGetPath('logs'),
    ])
    const [settingResult, gameResult, versionResult, statusResult, logResult] = results
    if (settingResult.ok) sync(settingResult.data)
    else error.value = settingResult.error
    if (gameResult.ok) game.value = gameResult.data
    else error.value = gameResult.error
    if (versionResult.ok) version.value = versionResult.data
    if (statusResult.ok) updater.value = statusResult.data.state
    const logs = accept(logResult)
    if (logs) logDirectory.value = logs
  })
})
</script>
<template>
  <div class="space-y-2">
    <UAlert
      v-if="!available"
      color="warning"
      icon="i-tabler-device-desktop"
      :title="t('ui.desktopOnly')"
    />
    <UTabs default-value="basic" :items="tabs" size="sm" class="w-full">
      <template #basic>
        <div class="grid gap-3 sm:grid-cols-2">
          <UCard class="sm:col-span-2" :ui="{ header: 'p-2 sm:p-2', body: 'p-2 sm:p-2' }">
            <template #header>
              <h2 class="font-semibold">{{ t('ui.preferences') }}</h2>
            </template>
            <div class="space-y-2">
              <UFormField :ui="{ container: 'mt-1' }" :label="t('ui.language')">
                <USelect
                  :model-value="settings?.displayLanguage ?? 'system'"
                  :items="languages"
                  class="w-full sm:w-64"
                  :disabled="!settings || busy"
                  @update:model-value="
                    (value: string) =>
                      save({
                        displayLanguage: value as SettingPreferences['displayLanguage'],
                      })
                  "
                />
              </UFormField>
              <SettingsDirectoryField
                :label="t('ui.downloadDir')"
                :path="settings?.downloadDirectory ?? ''"
                :disabled="!available || busy"
                @open="openDirectory"
              >
                <UButton
                  icon="i-tabler-edit"
                  color="neutral"
                  variant="outline"
                  :disabled="!available || busy"
                  @click="choose('download')"
                  >{{ t('ui.modifyDirectory') }}</UButton
                >
              </SettingsDirectoryField>
            </div>
          </UCard>
          <UCard :ui="{ header: 'p-2 sm:p-2', body: 'p-2 sm:p-2' }">
            <template #header>
              <h2 class="font-semibold">{{ t('ui.version') }}</h2>
            </template>
            <div class="space-y-2">
              <p class="text-muted">
                SCNexus {{ version }} ·
                {{ t(`ui.${updater === 'unavailable' ? 'unavailable' : updater}`) }}
              </p>
              <UProgress v-if="updater === 'downloading'" :model-value="progress" :max="100" />
              <div class="flex flex-wrap gap-2">
                <UButton
                  :disabled="
                    !available || busy || !['idle', 'available', 'failed'].includes(updater)
                  "
                  @click="update('check')"
                >
                  {{ t('ui.check') }}
                </UButton>
                <UButton
                  v-if="updater === 'available'"
                  :disabled="busy"
                  @click="update('download')"
                >
                  {{ t('ui.download') }}
                </UButton>
                <UButton
                  v-if="updater === 'downloaded'"
                  :disabled="busy"
                  @click="update('install')"
                >
                  {{ t('ui.install') }}
                </UButton>
              </div>
            </div>
          </UCard>
          <UCard :ui="{ header: 'p-2 sm:p-2', body: 'p-2 sm:p-2' }">
            <template #header>
              <h2 class="font-semibold">{{ t('ui.links') }}</h2>
            </template>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="link in links"
                :key="link.key"
                color="neutral"
                variant="ghost"
                trailing-icon="i-tabler-external-link"
                :disabled="!available || busy"
                @click="openLink(link.url)"
              >
                {{ t(`ui.${link.key}`) }}
              </UButton>
            </div>
          </UCard>
        </div>
      </template>
      <template #game>
        <div class="space-y-2">
          <UCard :ui="{ header: 'p-2 sm:p-2', body: 'p-2 sm:p-2' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold">{{ t('ui.game') }}</h2>
                <UBadge :color="game?.capabilities.client ? 'success' : 'warning'" variant="subtle">
                  {{ t(game?.capabilities.client ? 'ui.ready' : 'ui.notReady') }}
                </UBadge>
              </div>
            </template>
            <div class="space-y-2">
              <SettingsDirectoryField
                :label="t('ui.gameDir')"
                :path="game?.gameRoot ?? ''"
                :disabled="!available || busy"
                @open="openDirectory"
              />
              <div class="flex gap-2">
                <UButton :disabled="!available || busy" @click="choose('game')">
                  {{ t('ui.choose') }}
                </UButton>
                <UButton
                  color="neutral"
                  variant="outline"
                  :disabled="!available || busy"
                  @click="detect"
                >
                  {{ t('ui.detect') }}
                </UButton>
              </div>
              <SettingsDirectoryField
                :label="t('ui.management')"
                :path="game?.paths?.customizeDataRoot ?? ''"
                :disabled="!available || busy"
                @open="openDirectory"
              />
              <SettingsDirectoryField
                :label="t('ui.ccm')"
                :path="game?.paths?.ccmRoot ?? ''"
                :disabled="!available || busy"
                @open="openDirectory"
              />
            </div>
          </UCard>
        </div>
      </template>
      <template #logging>
        <div class="space-y-2">
          <UCard :ui="{ header: 'p-2 sm:p-2', body: 'p-2 sm:p-2' }">
            <template #header>
              <h2 class="font-semibold">{{ t('ui.logging') }}</h2>
            </template>
            <div class="space-y-2">
              <SettingsDirectoryField
                :label="t('ui.logDirectory')"
                :path="logDirectory"
                :disabled="!available || busy"
                @open="openDirectory"
              />
              <UFormField :ui="{ container: 'mt-1' }" :label="t('ui.logLevel')">
                <USelect
                  :items="levels"
                  :model-value="settings?.logLevel ?? 'error'"
                  :disabled="!settings || busy"
                  class="w-64"
                  @update:model-value="(value: string) => save({ logLevel: value as LogLevel })"
                />
              </UFormField>
              <UFormField
                :ui="{ container: 'mt-1' }"
                :label="t('ui.analytics')"
                :description="t('ui.analyticsHelp')"
              >
                <USwitch
                  :model-value="settings?.analyticsEnabled ?? true"
                  :disabled="!settings || busy"
                  @update:model-value="(value: boolean) => save({ analyticsEnabled: value })"
                />
              </UFormField>
              <UFormField
                :ui="{ container: 'mt-1' }"
                :label="t('ui.telemetry')"
                :description="t('ui.telemetryHelp')"
              >
                <USwitch
                  :model-value="settings?.telemetryEnabled ?? false"
                  :disabled="!settings || busy"
                  @update:model-value="(value: boolean) => save({ telemetryEnabled: value })"
                />
              </UFormField>
            </div>
          </UCard>
        </div>
      </template>
    </UTabs>
  </div>
</template>
