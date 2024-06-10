<script setup lang="ts">
import { ref, h } from "vue";
import { useDropZone } from "@vueuse/core";
import { filesize } from "filesize";
import { useI18n } from "vue-i18n";
import { useDialog, useNotification } from "naive-ui";

import { emitterEmit } from "@/composables/useMitt";
import { useProfileStore } from "@/stores/profile";

import GameProfileChecker from "./GameProfileChecker.vue";
import { ipcCampaign } from "@/apis/ipcs/campaign";
import { ipcCustomize } from "@/apis/ipcs/customize";
import { ipcDialog } from "@/apis/ipcs/dialog";

const { t } = useI18n();
const dialog = useDialog();
const notification = useNotification();
const profileStore = useProfileStore();

const dropZoneRef = ref<HTMLDivElement>();

const { isOverDropZone } = useDropZone(dropZoneRef, onDrop);

async function onDrop(files: File[] | null) {
  if (!profileStore.SUCCESS) {
    return;
  }
  await processFile(files?.[0].path!);
}

async function onClick() {
  if (!profileStore.SUCCESS) {
    return;
  }

  const { data } = await ipcDialog.showOpenDialog({
    title: t("customize.drop-zone.select-file-title"),
    properties: ["openFile"],
    filters: [
      { name: "SCNexus Compressed File", extensions: ["zip"] },
      { name: "CCM Compressed File", extensions: ["zip"] },
      { name: "ZIP Compressed File", extensions: ["zip"] },
    ],
  });
  if (!data) return;

  const { filePaths, canceled } = data;
  if (canceled || !filePaths) return;

  processFile(filePaths[0]);
}

async function processFile(path: string) {
  const { data: cfi, error } = await ipcCustomize.readCompressFileInfo7z(path);
  if (error) {
    console.error(error);
    return;
  }
  if (!cfi) {
    dialog.error({
      title: t("customize.drop-zone.process-dialog.cfi-error-title"),
      content: t("customize.drop-zone.process-dialog.cfi-error-message"),
    });
    return;
  }

  const { compress_info } = cfi;
  const metadata =
    cfi.metadata?.manager === "SCNexus" ? cfi.metadata : cfi.ccm?.metadata;
  const d = dialog.info({
    closable: false,
    title: () => {
      if (metadata?.type === "Customize") {
        return h(
          "div",
          undefined,
          t("customize.drop-zone.process-dialog.title-customize") +
            metadata.name
        );
      } else if (metadata?.type === "Campaign") {
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
              metadata?.author
          ),
          h(
            "div",
            undefined,
            t("customize.drop-zone.process-dialog.description-version") +
              metadata?.version
          ),
          h(
            "div",
            undefined,
            t("customize.drop-zone.process-dialog.description-description") +
              metadata?.description
          ),
        ]),
        h(
          "div",
          undefined,
          "共计：" +
            compress_info.files_count +
            "个文件" +
            " @ " +
            filesize(compress_info.size, { standard: "jedec" })
        ),
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
      let result = false;
      if (metadata?.manager === "SCNexus") {
        const { data, error } = await ipcCustomize.installCompressFile7z(path);
        if (error) {
          console.error(error);
        }
        if (data) {
          result = true;
        }
      } else if (metadata?.manager === "CCM") {
        const { data, error } =
          await ipcCampaign.unzipCompressFile7zSimulateCCM(path);
        if (error) {
          console.error(error);
        }
        if (data) {
          result = true;
        }
      }
      if (result) {
        emitterEmit("customize-file-unzipped");
        notification.info({
          title:
            t("customize.drop-zone.process-dialog.message-success-title") +
            metadata?.name,
          content: () =>
            h("div", { class: "flex flex-col gap-1" }, [
              h(
                "div",
                undefined,
                t(
                  "customize.drop-zone.process-dialog.message-success-content",
                  {
                    count: compress_info.files_count,
                  }
                )
              ),
              h(
                "div",
                undefined,
                "共计占用磁盘空间 " +
                  filesize(compress_info.size, { standard: "jedec" })
              ),
            ]),
          duration: 3000,
        });
      }
    },
  });
}
</script>

<template>
  <div
    class="cell-hoverable py-3 bg-gray-100 cursor-pointer"
    ref="dropZoneRef"
    @click="onClick"
  >
    <div
      v-if="profileStore.SUCCESS"
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
