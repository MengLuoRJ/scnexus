<script setup lang="ts">
import { get, set, useDropZone } from "@vueuse/core";
import { ref, h, onMounted, onUnmounted } from "vue";
import { useDialog, useMessage, useNotification } from "naive-ui";
import {
  readCompressFileInfo,
  installCompressFile,
} from "@/composables/useIpcHost/useCustomizeIpc";
import { getProfile } from "@/composables/useIpcHost/useSettingIpc";
import { LocalProfile } from "@shared/types/profile";
import { emiiterEmit, emiiterOff, emiiterOn } from "@/composables/useMitt";
import GameProfileChecker from "./GameProfileChecker.vue";
import { useI18n } from "vue-i18n";
import { unzipCompressFileCCM } from "@/composables/useIpcHost/useCampaignIpc";
import { ResultUncompress } from "@shared/types/customize";

const { t } = useI18n();
const dialog = useDialog();
const notification = useNotification();

const settingProfile = ref<LocalProfile>();

async function getLocalProfile() {
  const profile = await getProfile();
  set(settingProfile, profile);
}

const dropZoneRef = ref<HTMLDivElement>();

async function onDrop(files: File[] | null) {
  if (!get(settingProfile)?.SUCCESS) {
    notification.error({
      title: t("customize.drop-zone.no-game-message.title"),
      content: t("customize.drop-zone.no-game-message.content"),
      duration: 2000,
    });
    return;
  }
  await processFile(files?.[0].path!);
}

async function processFile(path: string) {
  const cfi = await readCompressFileInfo(path, { tolerance: true });
  if (!cfi) {
    return;
  }
  const { metadata, compress_info } = cfi;
  console.log(metadata);
  const d = dialog.info({
    closable: false,
    title: () => {
      if (metadata.type === "Customize") {
        return h(
          "div",
          undefined,
          t("customize.drop-zone.process-dialog.title-customize") +
            metadata.name
        );
      } else if (metadata.type === "Campaign") {
        return h(
          "div",
          undefined,
          t("customize.drop-zone.process-dialog.title-campaign") + metadata.name
        );
      }
    },
    content: () =>
      h("div", { class: "flex flex-col gap-1" }, [
        h("div", { class: "flex flex-col gap-1 cell-normal" }, [
          h(
            "div",
            undefined,
            t("customize.drop-zone.process-dialog.description-author") +
              metadata.author
          ),
          h(
            "div",
            undefined,
            t("customize.drop-zone.process-dialog.description-version") +
              metadata.version
          ),
          h(
            "div",
            undefined,
            t("customize.drop-zone.process-dialog.description-description") +
              metadata.description
          ),
        ]),
        h(
          "div",
          undefined,
          t("customize.drop-zone.process-dialog.description-install")
        ),
      ]),
    negativeText: t("customize.drop-zone.process-dialog.negative-text"),
    positiveText: t("customize.drop-zone.process-dialog.positive-text"),
    onPositiveClick: async () => {
      d.loading = true;
      let result: ResultUncompress;
      if (metadata.manager === "SCNexus") {
        result = await installCompressFile(path);
      } else if (metadata.manager === "CCM") {
        result = await unzipCompressFileCCM(path);
      } else {
        return;
      }
      if (result.success) {
        emiiterEmit("customize-file-unzipped");
        notification.info({
          title:
            t("customize.drop-zone.process-dialog.message-success-title") +
            metadata.name,
          content: t(
            "customize.drop-zone.process-dialog.message-success-content",
            { count: compress_info.file_count }
          ),
          duration: 3000,
        });
      }
    },
  });
}

const { isOverDropZone } = useDropZone(dropZoneRef, onDrop);

onMounted(async () => {
  await getLocalProfile();

  emiiterOn("customize-profile-changed", async () => {
    await getLocalProfile();
  });
});

onUnmounted(() => {
  emiiterOff("customize-profile-changed", async () => {
    await getLocalProfile();
  });
});
</script>

<template>
  <div class="cell-hoverable py-3 bg-gray-100 cursor-pointer" ref="dropZoneRef">
    <div
      v-if="settingProfile?.SUCCESS"
      class="w-full h-8 flex flex-col justify-center items-center gap-y-2"
    >
      <div
        v-if="!isOverDropZone"
        class="flex flex-row justify-center items-center gap-6"
      >
        <div class="i-tabler:file-zip h-9 w-9"></div>
        <div class="flex flex-col justify-center items-start gap-y-1">
          <div class="text-xs text-gray-600">
            {{ $t("customize.drop-zone.tip") }}
          </div>
          <div class="text-xs text-gray-500">
            {{ $t("customize.drop-zone.tip-extension") }}
          </div>
        </div>
      </div>
      <div
        v-if="!!isOverDropZone"
        class="flex flex-row justify-center items-center gap-6"
      >
        <div class="i-tabler:file-download h-9 w-9"></div>
        <div class="text-xs text-gray-500">
          {{ $t("customize.drop-zone.tip-release") }}
        </div>
      </div>
    </div>
    <GameProfileChecker v-else />
  </div>
</template>
@/composables/useIpcService/useCampaignIpc@/composables/useIpcService/useCustomizeIpc@/composables/useIpcHost/useSettingService
