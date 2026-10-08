<script lang="ts" setup>
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import * as desktopIpc from "../ipcs";
import type { GameSnapshot } from "@scnexus/app-shared/types/content-api.type";
import type {
  SettingSnapshot,
  SettingPreferences,
  LogLevel,
} from "@scnexus/app-shared/types/desktop.type";
import type {
  IpcResult,
  AppErrorDto,
} from "@scnexus/app-shared/errors/app.error";
defineOptions({ name: "SettingsView" });
const { t } = useI18n();
const settings = ref<SettingSnapshot | null>(null);
const game = ref<GameSnapshot | null>(null);
const downloadDirectory = ref("");
const version = ref("—");
const updater = ref<desktopIpc.UpdaterStatus["state"]>("unavailable");
const progress = ref(0);
const busy = ref(false);
const error = ref<AppErrorDto | null>(null);
const saved = ref(false);
const available = Boolean(window.scnexus);
const languages = computed(() => [
  { label: t("ui.system"), value: "system" },
  { label: "简体中文", value: "zh" },
  { label: "English", value: "en" },
  { label: "繁體中文", value: "zh-Hant" },
]);
const tabs = computed(() => [
  { label: t("ui.preferences"), value: "basic", slot: "basic" },
  { label: t("ui.game"), value: "game", slot: "game" },
  { label: t("ui.logging"), value: "logging", slot: "logging" },
]);
const levels: LogLevel[] = [
  "error",
  "warn",
  "info",
  "verbose",
  "debug",
  "silly",
];
function accept<T>(result: IpcResult<T>): T | undefined {
  if (!result.ok) {
    error.value = result.error;
    return;
  }
  return result.data;
}
function sync(value: SettingSnapshot) {
  settings.value = value;
  downloadDirectory.value = value.downloadDirectory;
}
async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  saved.value = false;
  try {
    await action();
  } finally {
    busy.value = false;
  }
}
async function save(patch: Partial<SettingPreferences>) {
  await run(async () => {
    const result = await desktopIpc.apiSettingUpdate(patch);
    if (result.ok) {
      sync(result.data);
      saved.value = true;
    } else {
      error.value = result.error;
      const snapshot = await desktopIpc.apiSettingGetSnapshot();
      if (snapshot.ok) sync(snapshot.data);
    }
  });
}
async function choose(kind: "game" | "download") {
  await run(async () => {
    const picked = accept(
      await desktopIpc.apiDialogShowOpenDialog({
        properties: ["openDirectory"],
        title: t(kind === "game" ? "ui.gameDir" : "ui.downloadDir"),
      }),
    );
    if (!picked || picked.canceled || !picked.filePaths[0]) return;
    if (kind === "game") {
      const result = await desktopIpc.apiGameSettingConfigure(
        picked.filePaths[0],
      );
      if (result.ok) game.value = result.data;
      else error.value = result.error;
    } else {
      const result = await desktopIpc.apiSettingUpdate({
        downloadDirectory: picked.filePaths[0],
      });
      if (result.ok) {
        sync(result.data);
        saved.value = true;
      } else error.value = result.error;
    }
  });
}
async function detect() {
  await run(async () => {
    const result = await desktopIpc.apiGameSettingInitialize();
    if (result.ok) game.value = result.data;
    else {
      error.value = result.error;
      const snapshot = await desktopIpc.apiGameSettingGet();
      if (snapshot.ok) game.value = snapshot.data;
    }
  });
}
async function update(action: "check" | "download" | "install") {
  await run(async () => {
    accept(
      await (action === "check"
        ? desktopIpc.apiUpdaterCheckForUpdates()
        : action === "download"
          ? desktopIpc.apiUpdaterDownloadUpdate()
          : desktopIpc.apiUpdaterQuitAndInstall()),
    );
    const status = await desktopIpc.apiUpdaterGetStatus();
    if (status.ok) updater.value = status.data.state;
  });
}
function openLink(url: string) {
  return run(async () => {
    accept(await desktopIpc.apiShellOpenExternalWebsite(url));
  });
}
const links = [
  { key: "website", url: "https://scnexus.net/" },
  { key: "terms", url: "https://scnexus.net/terms.html" },
  { key: "privacy", url: "https://scnexus.net/privacy-policy.html" },
  { key: "community", url: "https://scnexus.net/guide/#交流社区" },
  { key: "sponsor", url: "https://scnexus.net/sponsor.html" },
];
if (available) {
  desktopIpc.apiSettingOnChanged(sync);
  desktopIpc.apiUpdaterOnCheckingForUpdate(() => (updater.value = "checking"));
  desktopIpc.apiUpdaterOnUpdateAvailable(() => (updater.value = "available"));
  desktopIpc.apiUpdaterOnUpdateNotAvailable(() => (updater.value = "idle"));
  desktopIpc.apiUpdaterOnDownloadProgress((value) => {
    updater.value = "downloading";
    progress.value = value.percent;
  });
  desktopIpc.apiUpdaterOnUpdateDownloaded(() => (updater.value = "downloaded"));
  desktopIpc.apiUpdaterOnError((value) => {
    updater.value = "failed";
    error.value = value;
  });
}
onMounted(async () => {
  if (!available) return;
  await run(async () => {
    const results = await Promise.all([
      desktopIpc.apiSettingGetSnapshot(),
      desktopIpc.apiGameSettingGet(),
      desktopIpc.apiAppGetVersion(),
      desktopIpc.apiUpdaterGetStatus(),
    ]);
    const [settingResult, gameResult, versionResult, statusResult] = results;
    if (settingResult.ok) sync(settingResult.data);
    else error.value = settingResult.error;
    if (gameResult.ok) game.value = gameResult.data;
    else error.value = gameResult.error;
    if (versionResult.ok) version.value = versionResult.data;
    if (statusResult.ok) updater.value = statusResult.data.state;
  });
});
</script>
<template>
  <div class="space-y-2">
    <UAlert
      v-if="!available"
      color="warning"
      icon="i-tabler-device-desktop"
      :title="t('ui.desktopOnly')"
    />
    <UAlert
      v-if="error"
      color="error"
      icon="i-tabler-alert-circle"
      :title="`${t('ui.error')} · ${error.code}`"
      :description="`${error.message || error.description} · ${error.errorId}`"
    />
    <UAlert v-if="saved" color="success" :title="t('ui.saved')" />
    <UTabs default-value="basic" :items="tabs" size="sm" class="w-full">
      <template #basic>
        <div class="space-y-2">
          <UCard :ui="{ header: 'p-2 sm:p-2', body: 'p-2 sm:p-2' }">
            <template #header>
              <h2 class="font-semibold">{{ t("ui.preferences") }}</h2>
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
                        displayLanguage:
                          value as SettingPreferences['displayLanguage'],
                      })
                  "
                />
              </UFormField>
              <UFormField
                :ui="{ container: 'mt-1' }"
                :label="t('ui.downloadDir')"
              >
                <div class="flex flex-wrap gap-2">
                  <UInput
                    v-model="downloadDirectory"
                    class="min-w-0 flex-1"
                    :disabled="!settings || busy"
                  />
                  <UButton
                    color="neutral"
                    variant="outline"
                    :disabled="!available || busy"
                    @click="choose('download')"
                  >
                    {{ t("ui.choose") }}
                  </UButton>
                  <UButton
                    :disabled="
                      !settings ||
                      busy ||
                      downloadDirectory === settings.downloadDirectory
                    "
                    @click="save({ downloadDirectory })"
                  >
                    {{ t("ui.save") }}
                  </UButton>
                </div>
              </UFormField>
            </div>
          </UCard>
          <UCard :ui="{ header: 'p-2 sm:p-2', body: 'p-2 sm:p-2' }">
            <template #header>
              <h2 class="font-semibold">{{ t("ui.version") }}</h2>
            </template>
            <div class="space-y-2">
              <p class="text-muted">
                SCNexus {{ version }} ·
                {{
                  t(`ui.${updater === "unavailable" ? "unavailable" : updater}`)
                }}
              </p>
              <UProgress
                v-if="updater === 'downloading'"
                :model-value="progress"
                :max="100"
              />
              <div class="flex flex-wrap gap-2">
                <UButton
                  :disabled="
                    !available ||
                    busy ||
                    !['idle', 'available', 'failed'].includes(updater)
                  "
                  @click="update('check')"
                >
                  {{ t("ui.check") }}
                </UButton>
                <UButton
                  v-if="updater === 'available'"
                  :disabled="busy"
                  @click="update('download')"
                >
                  {{ t("ui.download") }}
                </UButton>
                <UButton
                  v-if="updater === 'downloaded'"
                  :disabled="busy"
                  @click="update('install')"
                >
                  {{ t("ui.install") }}
                </UButton>
              </div>
            </div>
          </UCard>
          <UCard :ui="{ header: 'p-2 sm:p-2', body: 'p-2 sm:p-2' }">
            <template #header>
              <h2 class="font-semibold">{{ t("ui.links") }}</h2>
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
                <h2 class="font-semibold">{{ t("ui.game") }}</h2>
                <UBadge
                  :color="game?.capabilities.client ? 'success' : 'warning'"
                  variant="subtle"
                >
                  {{
                    t(game?.capabilities.client ? "ui.ready" : "ui.notReady")
                  }}
                </UBadge>
              </div>
            </template>
            <div class="space-y-2">
              <UFormField :ui="{ container: 'mt-1' }" :label="t('ui.gameDir')">
                <UInput
                  :model-value="game?.gameRoot ?? ''"
                  readonly
                  class="w-full"
                />
              </UFormField>
              <div class="flex gap-2">
                <UButton :disabled="!available || busy" @click="choose('game')">
                  {{ t("ui.choose") }}
                </UButton>
                <UButton
                  color="neutral"
                  variant="outline"
                  :disabled="!available || busy"
                  @click="detect"
                >
                  {{ t("ui.detect") }}
                </UButton>
              </div>
              <UFormField
                :ui="{ container: 'mt-1' }"
                :label="t('ui.management')"
              >
                <UInput
                  :model-value="game?.paths?.customizeDataRoot ?? ''"
                  readonly
                  class="w-full"
                />
              </UFormField>
              <UFormField :ui="{ container: 'mt-1' }" :label="t('ui.ccm')">
                <UInput
                  :model-value="game?.paths?.ccmRoot ?? ''"
                  readonly
                  class="w-full"
                />
              </UFormField>
            </div>
          </UCard>
        </div>
      </template>
      <template #logging>
        <div class="space-y-2">
          <UCard :ui="{ header: 'p-2 sm:p-2', body: 'p-2 sm:p-2' }">
            <template #header>
              <h2 class="font-semibold">{{ t("ui.logging") }}</h2>
            </template>
            <div class="space-y-2">
              <UFormField :ui="{ container: 'mt-1' }" :label="t('ui.logLevel')">
                <USelect
                  :items="levels"
                  :model-value="settings?.logLevel ?? 'error'"
                  :disabled="!settings || busy"
                  class="w-64"
                  @update:model-value="
                    (value: string) => save({ logLevel: value as LogLevel })
                  "
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
                  @update:model-value="
                    (value: boolean) => save({ telemetryEnabled: value })
                  "
                />
              </UFormField>
            </div>
          </UCard>
        </div>
      </template>
    </UTabs>
  </div>
</template>
