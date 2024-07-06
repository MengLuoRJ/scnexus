<script lang="ts" setup>
import { computed, h, inject, ref } from "vue";
import { useI18n } from "vue-i18n";

import { filesize } from "filesize";
import { KEY_FILEPATH, KEY_CFI } from "../symbol";

import { emitterEmit } from "@/composables/useMitt";
import { ipcCampaign } from "@/apis/ipcs/campaign";
import { ipcCustomize } from "@/apis/ipcs/customize";
import { get, set } from "@vueuse/core";
import { useNotification } from "naive-ui";

const { t } = useI18n();
const notification = useNotification();

const refModal = ref();
const showModal = ref(false);
const operationLoading = ref(false);

const cfi = inject(KEY_CFI);
const metadata = computed(() =>
  get(cfi)?.metadata?.manager === "SCNexus"
    ? get(cfi)?.metadata
    : get(cfi)?.ccm?.metadata
);
const file_path = inject(KEY_FILEPATH);

const onContinuProcess = async () => {
  set(operationLoading, true);
  const vPath = get(file_path);
  const vCfi = get(cfi);
  const vMetadata = get(metadata);

  let result = false;
  if (vMetadata?.manager === "SCNexus") {
    const { data, error } = await ipcCustomize.installCompressFile7z(vPath!);
    if (error) {
      console.error(error);
    }
    if (data) {
      result = true;
    }
  } else if (vMetadata?.manager === "CCM") {
    const { data, error } = await ipcCampaign.unzipCompressFile7zSimulateCCM(
      vPath!
    );
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
        vMetadata?.name,
      content: () =>
        h("div", { class: "flex flex-col gap-1" }, [
          h(
            "div",
            undefined,
            t("customize.drop-zone.process-dialog.message-success-content", {
              count: vCfi!.compress_info.files_count,
            })
          ),
          h(
            "div",
            undefined,
            "共计占用磁盘空间 " +
              filesize(vCfi!.compress_info.size, { standard: "jedec" })
          ),
        ]),
      duration: 3000,
    });
  }
};

const open = () => {
  set(showModal, true);
  console.log(cfi);
};

const close = () => {
  set(showModal, false);
};

defineExpose({ open });
</script>
<template>
  <n-modal
    ref="refModal"
    v-model:show="showModal"
    preset="dialog"
    :negativeText="t('customize.drop-zone.process-dialog.negative-text')"
    :positiveText="t('customize.drop-zone.process-dialog.positive-text')"
    :loading="operationLoading"
    :onPositiveClick="onContinuProcess"
  >
    <template #header>
      <div v-if="metadata?.type === 'Customize'">
        {{
          t("customize.drop-zone.process-dialog.title-customize") +
          metadata.name
        }}
      </div>
      <div v-else-if="metadata?.type === 'Campaign'">
        {{
          t("customize.drop-zone.process-dialog.title-campaign") + metadata.name
        }}
      </div>
    </template>
    <div class="flex flex-col gap-1">
      <div class="flex flex-col gap-1 cell-normal">
        <div>
          {{
            t("customize.drop-zone.process-dialog.description-author") +
            metadata?.author
          }}
        </div>
        <div>
          {{
            t("customize.drop-zone.process-dialog.description-version") +
            metadata?.version
          }}
        </div>
        <div>
          {{
            t("customize.drop-zone.process-dialog.description-description") +
            metadata?.description
          }}
        </div>
        <div>
          {{
            "共计：" +
            cfi!.compress_info.files_count +
            "个文件" +
            " @ " +
            filesize(cfi!.compress_info.size, { standard: "jedec" })
          }}
        </div>
        <div>
          {{ t("customize.drop-zone.process-dialog.description-install") }}
        </div>
      </div>
    </div>
  </n-modal>
</template>
