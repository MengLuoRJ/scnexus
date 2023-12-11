<script setup lang="ts">
import { get, set, useDropZone } from "@vueuse/core";
import { ref, h } from "vue";
import { useDialog, useNotification } from "naive-ui";
import {
  readCompressFileInfo,
  installCompressFile,
} from "@/composables/useIpcHost/useCustomizeIpc";
import { emiiterEmit, emiiterOff, emiiterOn } from "@/composables/useMitt";
import GameProfileChecker from "./GameProfileChecker.vue";
import { useI18n } from "vue-i18n";
import {
  unzipCompressFileCCM,
  unzipCompressFileSimulateCCM,
} from "@/composables/useIpcHost/useCampaignIpc";
import { ResultUncompress } from "@shared/types/customize";
import { filesize } from "filesize";
import { showOpenDialog } from "@/composables/useIpcHost/useDialogIpc";
import { useLocalProfileStore } from "@/stores/local-profile";
import { storeToRefs } from "pinia";

const { t } = useI18n();
const dialog = useDialog();
const notification = useNotification();

const localProfileStore = useLocalProfileStore();
const { SUCCESS } = storeToRefs(localProfileStore);

const dropZoneRef = ref<HTMLDivElement>();

async function onDrop(files: File[] | null) {
  if (!get(SUCCESS)) {
    return;
  }
  await processFile(files?.[0].path!);
}

async function onClick() {
  if (!get(SUCCESS)) {
    return;
  }

  const { filePaths, canceled } = await showOpenDialog({
    title: t("customize.drop-zone.select-file-title"),
    properties: ["openFile"],
    filters: [
      { name: "SCNexus Compressed File", extensions: ["zip"] },
      { name: "CCM Compressed File", extensions: ["zip"] },
      { name: "ZIP Compressed File", extensions: ["zip"] },
    ],
  });

  if (canceled || !filePaths) return;

  processFile(filePaths[0]);
}

async function processFile(path: string) {
  const cfi = await readCompressFileInfo(path, { tolerance: true });
  if (!cfi) {
    dialog.error({
      title: t("customize.drop-zone.process-dialog.cfi-error-title"),
      content: t("customize.drop-zone.process-dialog.cfi-error-message"),
    });
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
          "共计：" +
            compress_info.file_count +
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
      let result: ResultUncompress;
      if (metadata.manager === "SCNexus") {
        result = await installCompressFile(path);
      } else if (metadata.manager === "CCM") {
        // result = await unzipCompressFileCCM(path);
        result = await unzipCompressFileSimulateCCM(path);
      } else {
        return;
      }
      if (result.success) {
        emiiterEmit("customize-file-unzipped");
        notification.info({
          title:
            t("customize.drop-zone.process-dialog.message-success-title") +
            metadata.name,
          content: () =>
            h("div", { class: "flex flex-col gap-1" }, [
              h(
                "div",
                undefined,
                t(
                  "customize.drop-zone.process-dialog.message-success-content",
                  {
                    count: compress_info.file_count,
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

const { isOverDropZone } = useDropZone(dropZoneRef, onDrop);
</script>

<template>
  <div
    class="cell-hoverable py-3 bg-gray-100 cursor-pointer"
    ref="dropZoneRef"
    @click="onClick"
  >
    <div
      v-if="SUCCESS"
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
