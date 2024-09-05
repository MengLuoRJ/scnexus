<script setup lang="ts">
import {
  createCustomize,
  createDraft,
  filedDraft,
  uploadDraft,
} from "@/views/Creator/composables/useWorkshopUploaderService";
import { useUploadCustomizeStore } from "@/stores/upload-customize";
import { get, set } from "@vueuse/core";
import { StepsProps } from "naive-ui";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { onMounted, ref } from "vue";

const uploadCustomizeStore = useUploadCustomizeStore();

const { uploader_step, uploader_type, upload_data, upload_progress } =
  storeToRefs(uploadCustomizeStore);

const step_status = ref<StepsProps["status"]>("process");

const process_step = ref<
  | "pending"
  | "customize-creating"
  | "draft-creating"
  | "draft-uploading"
  | "draft-filing"
>("pending");

const step = computed((): number => {
  switch (get(process_step)) {
    case "pending":
      return 0;
    case "customize-creating":
      return 1;
    case "draft-creating":
      return 2;
    case "draft-uploading":
      return 3;
    case "draft-filing":
      return 4;
    default:
      return 0;
  }
});

async function initFilingProcess() {
  if (get(uploader_type) === "create") {
    await processCreate();
  } else if (get(uploader_type) === "update") {
    await processUpdate();
  }
}

async function processCreate() {
  set(process_step, "customize-creating");
  await createCustomize();

  set(process_step, "draft-creating");
  const draft = await createDraft();

  set(process_step, "draft-uploading");
  await uploadDraft(draft.id);

  set(process_step, "draft-filing");
  await filedDraft(draft.id);

  uploadCustomizeStore.updateStep("finished");
}

async function processUpdate() {
  set(process_step, "draft-creating");
  const draft = await createDraft();
  set(step_status, "finish");

  set(process_step, "draft-uploading");
  await uploadDraft(draft.id);
  set(step_status, "finish");

  set(process_step, "draft-filing");
  await filedDraft(draft.id);
  set(step_status, "finish");

  uploadCustomizeStore.updateStep("finished");
}

onMounted(async () => {
  if (get(uploader_step) === "filing") {
    await initFilingProcess();
  } else {
    console.warn("uploader_step is not filing");
  }
});
</script>
<template>
  <div class="cell-normal py-2">
    <n-steps v-if="step !== -1" :current="step" :status="step_status">
      <n-step title="创建新作品" />
      <n-step title="生成作品草稿" />
      <n-step title="上传作品文件" />
      <n-step title="完成草稿上传" />
    </n-steps>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <div v-if="process_step === 'pending'">
      <n-result
        class="mt-6"
        status="404"
        title="上传准备中"
        description="正在准备上传，请稍候……"
      >
      </n-result>
    </div>
    <div v-if="process_step === 'customize-creating'">
      <n-result
        class="mt-6"
        title="正在创建新作品"
        description="正在为创建新的作品，这将提供作品基本信息。"
      >
        <template #icon><n-spin size="small" /></template>
      </n-result>
    </div>
    <div v-if="process_step === 'draft-creating'">
      <n-result
        class="mt-6"
        title="正在生成作品草稿"
        description="正在生成作品草稿，作品草稿将在审核完成后更新至作品内容。"
      >
        <template #icon><n-spin size="small" /></template>
      </n-result>
    </div>
    <div v-if="process_step === 'draft-uploading'">
      <n-result
        class="mt-6"
        title="上传作品文件"
        description="正在上传作品文件，作品文件将在草稿审核完成后允许玩家下载"
      >
        <template #icon>
          <div>
            <n-progress
              type="line"
              :percentage="(upload_progress.progress ?? 0) * 100"
              :indicator-placement="'inside'"
              processing
            />
            <div>
              {{
                upload_progress.bytes +
                  " / " +
                  upload_progress.total +
                  " @ " +
                  (upload_progress.rate ?? 0).toFixed(2)
              }}
            </div>
          </div>
        </template>
      </n-result>
    </div>
    <div v-if="process_step === 'draft-filing'">
      <n-result
        class="mt-6"
        title="正在完成草稿上传"
        description="作品草稿已上传完成，请等待审核。"
      >
        <template #icon><n-spin size="small" /></template>
      </n-result>
    </div>
  </div>
</template>
