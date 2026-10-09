<script lang="ts" setup>
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useCampaign } from "./useCampaign";
import CampaignOverview from "./components/CampaignOverview.vue";
import FileTree from "./components/FileTree.vue";
import ConflictChoices from "./components/ConflictChoices.vue";
import {
  AppError,
  ERRORS,
  normalizeError,
  toErrorDto,
} from "@scnexus/app-shared/errors/app.error";
import {
  apiDialogShowOpenDialog,
  getPathForFile,
  apiShellShowItemInFolder,
} from "../../ipcs";
import type {
  ContentRecord,
  PackageCampaignType,
  ConflictDecision,
  RemovalDecision,
  InstallMode,
} from "@scnexus/app-shared/types/content.type";
import wolThumbnail from "../../assets/campaign/Campaign_WOL_thumbnail.png";
import hotsThumbnail from "../../assets/campaign/Campaign_HOTS_thumbnail.png";
import lotvThumbnail from "../../assets/campaign/Campaign_LOTV_thumbnail.png";
import thumbnail from "../../assets/campaign/Campaign_thumbnail.png";
defineOptions({ name: "CampaignView" });
const { t } = useI18n();
const service = useCampaign();
const {
  diagnostics,
  records,
  active,
  analysis,
  activation,
  removal,
  mode,
  busy,
  error,
  preview,
  conflicts,
  existing,
} = service;
const available = Boolean(window.scnexus);
const sourcePickerOpen = ref(false);
const chooserOpen = ref(false);
const viewMode = ref("overview");
function manageCategory(value: PackageCampaignType) {
  category.value = value;
  chooserOpen.value = true;
}
const headerReady = ref(false);
const pendingUninstall = ref<ContentRecord | null>(null);
const current = computed(
  () =>
    records.value.find(
      (record) => record.localId === active.value[category.value]?.localId,
    ) ?? null,
);
async function uninstallCurrent(record: ContentRecord) {
  pendingUninstall.value = record;
  await service.prepare(record, "deactivate");
}
async function confirmOperation() {
  const restoring = removal.value?.operation === "deactivate";
  await service.confirm(decisions.value, removals.value);
  if (restoring && !removal.value && !error.value && pendingUninstall.value) {
    const record = pendingUninstall.value;
    pendingUninstall.value = null;
    await service.prepare(record, "uninstall");
  }
}
async function closeOperation() {
  pendingUninstall.value = null;
  await service.close();
}
async function launch() {
  if (busy.value) return;
  busy.value = true;
  try {
    const result = await apiCampaignLaunch();
    if (!result.ok) error.value = result.error;
  } finally {
    busy.value = false;
  }
}
async function openWebsite(url: string) {
  const result = await apiShellOpenExternalWebsite(url);
  if (!result.ok) error.value = result.error;
}
const category = ref<PackageCampaignType>("WOL");
const selected = ref<ContentRecord | null>(null);
const decisions = ref<ConflictDecision[]>([]);
const removals = ref<RemovalDecision[]>([]);
import wolLogo from "../../assets/campaign/Campaign_WOL_LOGO.png";
import hotsLogo from "../../assets/campaign/Campaign_HOTS_LOGO.png";
import lotvLogo from "../../assets/campaign/Campaign_LOTV_LOGO.png";
import ncoLogo from "../../assets/campaign/Campaign_NCO_LOGO.png";
const logos = { WOL: wolLogo, HOTS: hotsLogo, LOTV: lotvLogo, NCO: ncoLogo };
async function chooseRecord(record: ContentRecord) {
  chooserOpen.value = false;
  await service.prepare(record, "activate");
}
const image = {
  WOL: wolThumbnail,
  HOTS: hotsThumbnail,
  LOTV: lotvThumbnail,
  NCO: thumbnail,
};
const categories = computed(() =>
  ["WOL", "HOTS", "LOTV", "NCO"].map((value) => ({
    label: t(`campaign.${value}`),
    value,
  })),
);
const list = computed(() =>
  records.value.filter((record) => record.package.campaign === category.value),
);
const modes = computed(() =>
  ["scnexus", "ccm", "auto"].map((value) => ({
    label:
      value === "auto"
        ? t("campaign.auto")
        : value === "ccm"
          ? "CCM"
          : "SCNexus",
    value,
    disabled: !analysis.value?.modes[value as InstallMode],
  })),
);
const open = computed(() =>
  Boolean(analysis.value || activation.value || removal.value),
);
const canConfirm = computed(
  () =>
    !busy.value &&
    (analysis.value
      ? Boolean(preview.value) && !existing.value.length
      : true) &&
    conflicts.value.every((file) =>
      decisions.value.some((item) => item.conflictId === file.conflictId),
    ) &&
    (removal.value?.files ?? []).every((file) =>
      removals.value.some((item) => item.conflictId === file.conflictId),
    ),
);
const title = computed(() =>
  t(
    analysis.value
      ? "campaign.analyze"
      : activation.value
        ? "campaign.activate"
        : removal.value?.operation === "deactivate"
          ? "campaign.deactivate"
          : "campaign.uninstall",
  ),
);
watch([mode, analysis, activation, removal], () => {
  decisions.value = [];
  removals.value = [];
});
async function selectSource(kind: "archive" | "directory") {
  const result = await apiDialogShowOpenDialog({
    properties: [kind === "directory" ? "openDirectory" : "openFile"],
    filters:
      kind === "archive"
        ? [{ name: "Archives", extensions: ["zip", "7z", "rar"] }]
        : undefined,
  });
  if (!result.ok) {
    error.value = result.error;
    return;
  }
  if (!result.data.canceled && result.data.filePaths[0])
    await service.analyze({ kind, path: result.data.filePaths[0] });
}
async function drop(event: DragEvent) {
  if (busy.value || !available || !event.dataTransfer?.types.includes("Files"))
    return;
  const files = event.dataTransfer?.files;
  if (!files?.length) return;
  if (files.length !== 1) {
    error.value = toErrorDto(
      new AppError(ERRORS.IPC_INVALID_ARGUMENT, {
        message: t("campaign.oneSource"),
      }),
    );
    return;
  }
  try {
    const path = getPathForFile(files[0]!);
    if (!path) return;
    await service.analyze({
      kind: /\.(zip|7z|rar)$/i.test(path) ? "archive" : "directory",
      path,
    });
  } catch (value) {
    error.value = toErrorDto(normalizeError(value));
  }
}
function removalChoice(id: string, action: "keep" | "delete") {
  removals.value = [
    ...removals.value.filter((item) => item.conflictId !== id),
    { conflictId: id, action },
  ];
}
async function showFolder(record: ContentRecord) {
  const result = await apiShellShowItemInFolder(record.descriptorPath);
  if (!result.ok) error.value = result.error;
}
function size(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}
onMounted(() => {
  headerReady.value = true;
  if (window.scnexus) void service.refresh();
});
</script>
<template>
  <div class="space-y-2">
    <UAlert v-if="!available" color="warning" :title="t('ui.desktopOnly')" />
    <UAlert
      v-if="error"
      color="error"
      :title="`${t('ui.error')} · ${error.code}`"
      :description="`${error.message || error.description} · ${error.errorId}`"
    />
    <UButton
      v-if="error?.code === 'M011' || error?.code === 'M013'"
      to="/settings"
      color="neutral"
      variant="outline"
    >
      {{ t("ui.start") }}
    </UButton>
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
        :disabled="busy || !available"
        @click="service.refresh"
      >
        {{ t("campaign.refresh") }}
      </UButton>
      <UButton
        icon="i-tabler-database-search"
        size="sm"
        color="neutral"
        variant="ghost"
        :disabled="busy || !available"
        @click="service.scan"
      >
        {{ t("campaign.scan") }}
      </UButton>
    </Teleport>
    <CampaignOverview
      v-if="viewMode === 'overview'"
      :records="records"
      :active="active"
      :busy="busy"
      @manage="manageCategory"
      @deactivate="(record) => service.prepare(record, 'deactivate')"
      @uninstall="uninstallCurrent"
    />
    <template v-else>
      <UTabs
        v-model="category"
        :items="categories"
        :content="false"
        variant="link"
      >
        <template #leading="{ item }">
          <img
            draggable="false"
            :src="image[item.value as PackageCampaignType]"
            alt=""
            class="size-6 object-contain"
          />
        </template>
      </UTabs>
      <div class="grid gap-2 md:grid-cols-[240px_1fr]">
        <UCard :ui="{ body: 'p-2 sm:p-2' }">
          <div class="flex h-full flex-col items-center gap-2 text-center">
            <img
              draggable="false"
              :src="logos[category]"
              alt=""
              class="h-32 w-full object-contain"
            />
            <h2 class="font-semibold">{{ t(`campaign.${category}`) }}</h2>
            <template v-if="current">
              <p>{{ current.package.name }}</p>
              <UBadge variant="subtle">
                {{ current.package.version }} · {{ current.mode }}
              </UBadge>
              <p class="text-sm text-muted">{{ current.package.author }}</p>
            </template>
            <UBadge v-else color="neutral" variant="subtle">
              {{ t("campaign.official") }}
            </UBadge>
            <div class="mt-auto flex w-full flex-col gap-1">
              <UButton
                icon="i-tabler-arrows-exchange"
                size="sm"
                block
                :disabled="busy || !available"
                @click="manageCategory(category)"
              >
                {{ t(current ? "campaign.switch" : "campaign.activate") }}
              </UButton>
              <UButton
                icon="i-tabler-refresh"
                v-if="current"
                size="sm"
                block
                color="neutral"
                variant="outline"
                :disabled="busy"
                @click="service.prepare(current, 'deactivate')"
              >
                {{ t("campaign.restore") }}
              </UButton>
              <UButton
                icon="i-tabler-trash"
                v-if="current"
                size="sm"
                block
                color="error"
                variant="soft"
                :disabled="busy"
                @click="uninstallCurrent(current)"
              >
                {{ t("campaign.uninstall") }}
              </UButton>
              <UButton
                block
                icon="i-tabler-player-play"
                :disabled="busy || !available"
                @click="launch"
              >
                {{ t("campaign.start") }}
              </UButton>
            </div>
          </div>
        </UCard>
        <UCard :ui="{ body: 'p-2 sm:p-2' }">
          <div class="space-y-2 text-sm">
            <h3 class="font-semibold">{{ t("campaign.details") }}</h3>
            <p class="whitespace-pre-wrap">
              {{ current?.package.description || t("campaign.overviewHint") }}
            </p>
            <template v-if="current">
              <p>SCNID: {{ current.package.scnid ?? "—" }}</p>
              <p>
                {{ current.fileCount }} {{ t("campaign.files") }} ·
                {{ size(current.bytes) }}
              </p>
              <p class="break-all">{{ current.managementDirectory }}</p>
              <UButton
                icon="i-tabler-folder"
                color="neutral"
                variant="outline"
                @click="showFolder(current)"
              >
                {{ t("campaign.openFolder") }}
              </UButton>
              <UButton
                icon="i-tabler-external-link"
                v-if="current.package.website"
                color="neutral"
                variant="ghost"
                @click="openWebsite(current.package.website)"
              >
                {{ t("ui.website") }}
              </UButton>
              <div
                v-for="(group, key) in {
                  social: current.package.social,
                  sponsor: current.package.sponsor,
                }"
                :key="key"
                class="space-y-1"
              >
                <p v-for="(value, name) in group" :key="name" class="break-all">
                  {{ name }}: {{ value }}
                </p>
              </div>
            </template>
          </div>
        </UCard>
      </div>
    </template>
    <div class="space-y-2">
      <div v-if="viewMode === 'overview'" class="flex justify-center">
        <UButton
          icon="i-tabler-player-play"
          size="lg"
          class="h-10 px-6"
          :disabled="busy || !available"
          @click="launch"
        >
          {{ t("campaign.start") }}
        </UButton>
      </div>
      <div
        class="rounded border border-default bg-elevated/50 transition-colors hover:border-primary"
        @dragover.prevent
        @drop.stop.prevent="drop"
      >
        <button
          type="button"
          :disabled="busy || !available"
          class="flex min-h-20 w-full items-center justify-center gap-2 p-2 disabled:cursor-not-allowed disabled:opacity-50"
          @click="sourcePickerOpen = true"
        >
          <UIcon name="i-tabler-file-zip" class="size-9 shrink-0" />
          <span class="text-left">
            <span class="block text-sm text-default">
              {{ t("campaign.dropClick") }}
            </span>
            <span class="block text-xs text-muted">
              ZIP · 7z · RAR · {{ t("campaign.folder") }}
            </span>
          </span>
        </button>
      </div>
    </div>
    <UModal v-model:open="sourcePickerOpen" :title="t('campaign.analyze')">
      <template #body>
        <div class="flex justify-center gap-2">
          <UButton
            icon="i-tabler-file-zip"
            :disabled="busy"
            @click="
              sourcePickerOpen = false;
              selectSource('archive');
            "
          >
            {{ t("campaign.importArchive") }}
          </UButton>
          <UButton
            icon="i-tabler-folder"
            color="neutral"
            variant="outline"
            :disabled="busy"
            @click="
              sourcePickerOpen = false;
              selectSource('directory');
            "
          >
            {{ t("campaign.importFolder") }}
          </UButton>
        </div>
      </template>
    </UModal>
    <UModal
      v-model:open="chooserOpen"
      :title="t('campaign.switch')"
      :ui="{ content: 'sm:max-w-3xl' }"
    >
      <template #body>
        <div class="space-y-2">
          <UAlert
            v-if="!list.length"
            :title="t('campaign.empty')"
            color="neutral"
          />
          <UCard
            v-for="record in list"
            :key="record.localId"
            :ui="{ body: 'p-2 sm:p-2' }"
          >
            <div class="flex flex-wrap items-center gap-2">
              <img
                draggable="false"
                :src="image[category]"
                class="size-10 rounded object-cover"
                alt=""
              />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1">
                  <span class="font-semibold">{{ record.package.name }}</span>
                  <UBadge color="neutral" variant="subtle">
                    {{ record.package.version || "—" }}
                  </UBadge>
                  <UBadge variant="subtle">{{ record.mode }}</UBadge>
                  <UBadge
                    v-if="active[category]?.localId === record.localId"
                    color="success"
                  >
                    {{ t("campaign.active") }}
                  </UBadge>
                </div>
                <p class="text-xs text-muted">
                  {{ record.package.author }} · {{ record.fileCount }}
                  {{ t("campaign.files") }} ·
                  {{ size(record.bytes) }}
                </p>
              </div>
              <div class="flex flex-wrap gap-1">
                <UButton
                  icon="i-tabler-info-circle"
                  color="neutral"
                  variant="ghost"
                  @click="selected = record"
                >
                  {{ t("campaign.details") }}
                </UButton>
                <UButton
                  icon="i-tabler-refresh"
                  v-if="active[category]?.localId === record.localId"
                  :disabled="busy"
                  color="warning"
                  variant="soft"
                  @click="service.prepare(record, 'deactivate')"
                >
                  {{ t("campaign.deactivate") }}
                </UButton>
                <UButton
                  icon="i-tabler-check"
                  v-else
                  :disabled="
                    busy ||
                    Boolean(active[category]) ||
                    !record.payloadDirectory
                  "
                  @click="chooseRecord(record)"
                >
                  {{ t("campaign.activate") }}
                </UButton>
                <UButton
                  icon="i-tabler-trash"
                  color="error"
                  variant="soft"
                  :disabled="
                    busy || active[category]?.localId === record.localId
                  "
                  @click="service.prepare(record, 'uninstall')"
                >
                  {{ t("campaign.uninstall") }}
                </UButton>
              </div>
            </div>
          </UCard>
          <p v-if="active[category]" class="text-xs text-muted">
            {{ t("campaign.switchHint") }}
          </p>
        </div>
      </template>
    </UModal>
    <UModal
      :open="Boolean(selected)"
      :title="selected?.package.name"
      @update:open="
        (value: boolean) => {
          if (!value) selected = null;
        }
      "
    >
      <template #body>
        <div v-if="selected" class="space-y-2 text-sm">
          <p class="whitespace-pre-wrap">{{ selected.package.description }}</p>
          <p class="break-all">{{ selected.managementDirectory }}</p>
          <UButton
            icon="i-tabler-folder"
            color="neutral"
            variant="outline"
            @click="showFolder(selected)"
          >
            {{ t("campaign.openFolder") }}
          </UButton>
          <FileTree :tree="selected.targetTree" />
        </div>
      </template>
    </UModal>
    <UModal
      :open="open"
      :title="title"
      :dismissible="!busy"
      :ui="{ content: 'sm:max-w-3xl' }"
      @update:open="
        (value: boolean) => {
          if (!value && !busy) closeOperation();
        }
      "
    >
      <template #body>
        <div class="space-y-2">
          <UAlert
            v-if="error"
            color="error"
            :title="`${error.code} · ${error.message || error.description}`"
            :description="error.errorId"
          />
          <template v-if="analysis">
            <USelect
              v-model="mode"
              :items="modes"
              class="w-full"
              :disabled="busy"
            />
            <p v-if="analysis.recommendedMode" class="text-xs text-muted">
              {{ t("campaign.recommended") }}: {{ analysis.recommendedMode }}
            </p>
            <UAlert
              v-if="mode === 'ccm'"
              color="warning"
              :title="t('campaign.ccmWarning')"
            />
            <div
              v-for="item in existing"
              :key="item.directory"
              class="rounded border border-warning p-2 text-sm"
            >
              <p>
                {{ t("campaign.exists") }}:
                {{ item.package?.name || item.diagnostic?.message }}
              </p>
              <p class="break-all">{{ item.directory }}</p>
            </div>
            <div v-if="preview" class="text-sm">
              <p class="font-semibold">
                {{ preview.package.name }} · {{ preview.package.campaign }} ·
                {{ preview.fileCount }} {{ t("campaign.files") }} ·
                {{ size(preview.bytes) }}
              </p>
              <p>{{ preview.package.description }}</p>
              <p class="text-xs text-muted">{{ preview.descriptorPath }}</p>
            </div>
            <details>
              <summary>{{ t("campaign.sourceTree") }}</summary>
              <FileTree :tree="analysis.sourceTree" />
            </details>
            <details v-if="preview">
              <summary>{{ t("campaign.targetTree") }}</summary>
              <FileTree :tree="preview.targetTree" />
            </details>
            <p
              v-for="(diagnostic, index) in analysis.diagnostics"
              :key="index"
              class="text-xs text-muted"
            >
              {{ diagnostic.mode }} · {{ diagnostic.code }} ·
              {{ diagnostic.message }}
            </p>
          </template>
          <p v-if="activation" class="text-sm font-semibold">
            {{
              records.find((record) => record.localId === activation?.localId)
                ?.package.name
            }}
          </p>
          <ConflictChoices v-model="decisions" :files="conflicts" />
          <template v-if="removal">
            <p>{{ t("campaign.removeConfirm") }}</p>
            <p v-if="pendingUninstall" class="text-warning">
              {{ t("campaign.uninstallActiveHint") }}
            </p>
            <div
              v-for="file in removal.files"
              :key="file.conflictId"
              class="space-y-1 rounded border border-warning p-2 text-sm"
            >
              <p class="break-all">{{ file.file.target }}</p>
              <p>
                {{ t("campaign.usedBy") }}:
                {{ file.usedBy.map((item) => item.name).join(", ") }}
              </p>
              <USelect
                :placeholder="t('campaign.chooseConflict')"
                :items="[
                  { label: t('campaign.keep'), value: 'keep' },
                  { label: t('campaign.delete'), value: 'delete' },
                ]"
                :model-value="
                  removals.find((item) => item.conflictId === file.conflictId)
                    ?.action
                "
                @update:model-value="
                  (value) =>
                    removalChoice(file.conflictId, value as 'keep' | 'delete')
                "
              />
            </div>
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-1">
          <UButton
            color="neutral"
            variant="outline"
            :disabled="busy"
            @click="closeOperation"
          >
            {{ t("campaign.cancel") }}
          </UButton>
          <UButton
            :disabled="!canConfirm"
            :loading="busy"
            @click="confirmOperation"
          >
            {{ t("campaign.confirm") }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
