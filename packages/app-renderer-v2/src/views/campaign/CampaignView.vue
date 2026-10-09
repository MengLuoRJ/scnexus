<script lang="ts" setup>
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useCampaign } from "./useCampaign";
import FileTree from "./components/FileTree.vue";
import ConflictChoices from "./components/ConflictChoices.vue";
import { AppError, ERRORS, normalizeError, toErrorDto } from "@scnexus/app-shared/errors/app.error";
import { apiDialogShowOpenDialog, getPathForFile, apiShellShowItemInFolder } from "../../ipcs";
import type {
  ContentRecord,
  PackageCampaignType,
  ConflictDecision,
  RemovalDecision,
  InstallMode,
} from "@scnexus/app-shared/types/content.type";
import wol from "../../assets/campaign/Campaign_WOL_thumbnail.png";
import hots from "../../assets/campaign/Campaign_HOTS_thumbnail.png";
import lotv from "../../assets/campaign/Campaign_LOTV_thumbnail.png";
import nco from "../../assets/campaign/Campaign_NCO_LOGO.png";
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
const category = ref<PackageCampaignType>("WOL");
const selected = ref<ContentRecord | null>(null);
const decisions = ref<ConflictDecision[]>([]);
const removals = ref<RemovalDecision[]>([]);
const image = { WOL: wol, HOTS: hots, LOTV: lotv, NCO: nco };
const categories = computed(() =>
  ["WOL", "HOTS", "LOTV", "NCO"].map((value) => ({ label: t(`campaign.${value}`), value })),
);
const list = computed(() =>
  records.value.filter((record) => record.package.campaign === category.value),
);
const modes = computed(() =>
  ["scnexus", "ccm", "auto"].map((value) => ({
    label: value === "auto" ? t("campaign.auto") : value === "ccm" ? "CCM" : "SCNexus",
    value,
    disabled: !analysis.value?.modes[value as InstallMode],
  })),
);
const open = computed(() => Boolean(analysis.value || activation.value || removal.value));
const canConfirm = computed(
  () =>
    !busy.value &&
    (analysis.value ? Boolean(preview.value) && !existing.value.length : true) &&
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
      kind === "archive" ? [{ name: "Archives", extensions: ["zip", "7z", "rar"] }] : undefined,
  });
  if (!result.ok) {
    error.value = result.error;
    return;
  }
  if (!result.data.canceled && result.data.filePaths[0])
    await service.analyze({ kind, path: result.data.filePaths[0] });
}
async function drop(event: DragEvent) {
  if (busy.value) return;
  const files = event.dataTransfer?.files;
  if (!files?.length) return;
  if (files.length !== 1) {
    error.value = toErrorDto(
      new AppError(ERRORS.IPC_INVALID_ARGUMENT, { message: t("campaign.oneSource") }),
    );
    return;
  }
  try {
    const path = getPathForFile(files[0]!);
    await service.analyze({ kind: /\.(zip|7z|rar)$/i.test(path) ? "archive" : "directory", path });
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
  if (window.scnexus) void service.refresh();
});
</script>
<template>
  <div class="space-y-2" @dragover.prevent @drop.prevent="drop">
    <UAlert v-if="!available" color="warning" :title="t('ui.desktopOnly')" />
    <UAlert
      v-if="error"
      color="error"
      :title="`${t('ui.error')} · ${error.code}`"
      :description="`${error.message || error.description} · ${error.errorId}`"
    />
    <div class="flex flex-wrap gap-1">
      <UButton :disabled="busy || !available" @click="selectSource('archive')">{{
        t("campaign.importArchive")
      }}</UButton
      ><UButton
        color="neutral"
        variant="outline"
        :disabled="busy || !available"
        @click="selectSource('directory')"
        >{{ t("campaign.importFolder") }}</UButton
      ><UButton
        color="neutral"
        variant="ghost"
        :disabled="busy || !available"
        @click="service.refresh"
        >{{ t("campaign.refresh") }}</UButton
      ><UButton
        color="neutral"
        variant="ghost"
        :disabled="busy || !available"
        @click="service.scan"
        >{{ t("campaign.scan") }}</UButton
      >
    </div>
    <p class="text-xs text-muted">{{ t("campaign.dropHint") }}</p>
    <UButton
      v-if="error?.code === 'M011' || error?.code === 'M013'"
      to="/settings"
      color="neutral"
      variant="outline"
      >{{ t("ui.start") }}</UButton
    >
    <UAlert
      v-for="item in diagnostics"
      :key="item.path"
      color="warning"
      :title="item.message"
      :description="item.path"
    />
    <UTabs v-model="category" :items="categories" :content="false" />
    <div class="flex items-center gap-2 rounded border border-default p-2">
      <img
        :src="image[category]"
        class="size-12 rounded object-cover"
        :alt="t(`campaign.${category}`)"
      />
      <div>
        <h2 class="font-semibold">{{ t(`campaign.${category}`) }}</h2>
        <p class="text-sm text-muted">
          {{ t("campaign.active") }}:
          {{
            records.find((record) => record.localId === active[category]?.localId)?.package.name ??
            (active[category]?.localId || t("campaign.none"))
          }}
        </p>
      </div>
    </div>
    <UAlert v-if="!list.length" :title="t('campaign.empty')" color="neutral" />
    <UCard v-for="record in list" :key="record.localId" :ui="{ body: 'p-2 sm:p-2' }"
      ><div class="flex flex-wrap items-center gap-2">
        <img :src="image[category]" class="size-10 rounded object-cover" alt="" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1">
            <span class="font-semibold">{{ record.package.name }}</span
            ><UBadge color="neutral" variant="subtle">{{ record.package.version || "—" }}</UBadge
            ><UBadge variant="subtle">{{ record.mode }}</UBadge
            ><UBadge v-if="active[category]?.localId === record.localId" color="success">{{
              t("campaign.active")
            }}</UBadge>
          </div>
          <p class="text-xs text-muted">
            {{ record.package.author }} · {{ record.fileCount }} {{ t("campaign.files") }} ·
            {{ size(record.bytes) }}
          </p>
        </div>
        <div class="flex flex-wrap gap-1">
          <UButton color="neutral" variant="ghost" @click="selected = record">{{
            t("campaign.details")
          }}</UButton
          ><UButton
            v-if="active[category]?.localId === record.localId"
            :disabled="busy"
            color="warning"
            variant="soft"
            @click="service.prepare(record, 'deactivate')"
            >{{ t("campaign.deactivate") }}</UButton
          ><UButton
            v-else
            :disabled="busy || Boolean(active[category]) || !record.payloadDirectory"
            @click="service.prepare(record, 'activate')"
            >{{ t("campaign.activate") }}</UButton
          ><UButton
            color="error"
            variant="soft"
            :disabled="busy || active[category]?.localId === record.localId"
            @click="service.prepare(record, 'uninstall')"
            >{{ t("campaign.uninstall") }}</UButton
          >
        </div>
      </div></UCard
    >
    <p v-if="active[category]" class="text-xs text-muted">{{ t("campaign.switchHint") }}</p>
    <UModal
      :open="Boolean(selected)"
      :title="selected?.package.name"
      @update:open="
        (value: boolean) => {
          if (!value) selected = null;
        }
      "
      ><template #body
        ><div v-if="selected" class="space-y-2 text-sm">
          <p class="whitespace-pre-wrap">{{ selected.package.description }}</p>
          <p class="break-all">{{ selected.managementDirectory }}</p>
          <UButton color="neutral" variant="outline" @click="showFolder(selected)">{{
            t("campaign.openFolder")
          }}</UButton
          ><FileTree :tree="selected.targetTree" /></div></template
    ></UModal>
    <UModal
      :open="open"
      :title="title"
      :dismissible="!busy"
      :ui="{ content: 'sm:max-w-3xl' }"
      @update:open="
        (value: boolean) => {
          if (!value && !busy) service.close();
        }
      "
      ><template #body
        ><div class="space-y-2">
          <UAlert
            v-if="error"
            color="error"
            :title="`${error.code} · ${error.message || error.description}`"
            :description="error.errorId"
          />
          <template v-if="analysis"
            ><USelect v-model="mode" :items="modes" class="w-full" :disabled="busy" />
            <p v-if="analysis.recommendedMode" class="text-xs text-muted">
              {{ t("campaign.recommended") }}: {{ analysis.recommendedMode }}
            </p>
            <UAlert v-if="mode === 'ccm'" color="warning" :title="t('campaign.ccmWarning')" />
            <div
              v-for="item in existing"
              :key="item.directory"
              class="rounded border border-warning p-2 text-sm"
            >
              <p>
                {{ t("campaign.exists") }}: {{ item.package?.name || item.diagnostic?.message }}
              </p>
              <p class="break-all">{{ item.directory }}</p>
            </div>
            <div v-if="preview" class="text-sm">
              <p class="font-semibold">
                {{ preview.package.name }} · {{ preview.package.campaign }} ·
                {{ preview.fileCount }} {{ t("campaign.files") }} · {{ size(preview.bytes) }}
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
              {{ diagnostic.mode }} · {{ diagnostic.code }} · {{ diagnostic.message }}
            </p></template
          >
          <p v-if="activation" class="text-sm font-semibold">
            {{ records.find((record) => record.localId === activation?.localId)?.package.name }}
          </p>
          <ConflictChoices v-model="decisions" :files="conflicts" />
          <template v-if="removal"
            ><p>{{ t("campaign.removeConfirm") }}</p>
            <div
              v-for="file in removal.files"
              :key="file.conflictId"
              class="space-y-1 rounded border border-warning p-2 text-sm"
            >
              <p class="break-all">{{ file.file.target }}</p>
              <p>
                {{ t("campaign.usedBy") }}: {{ file.usedBy.map((item) => item.name).join(", ") }}
              </p>
              <USelect
                :placeholder="t('campaign.chooseConflict')"
                :items="[
                  { label: t('campaign.keep'), value: 'keep' },
                  { label: t('campaign.delete'), value: 'delete' },
                ]"
                :model-value="removals.find((item) => item.conflictId === file.conflictId)?.action"
                @update:model-value="
                  (value) => removalChoice(file.conflictId, value as 'keep' | 'delete')
                "
              /></div
          ></template></div></template
      ><template #footer
        ><div class="flex w-full justify-end gap-1">
          <UButton color="neutral" variant="outline" :disabled="busy" @click="service.close">{{
            t("campaign.cancel")
          }}</UButton
          ><UButton
            :disabled="!canConfirm"
            :loading="busy"
            @click="service.confirm(decisions, removals)"
            >{{ t("campaign.confirm") }}</UButton
          >
        </div></template
      ></UModal
    >
  </div>
</template>
