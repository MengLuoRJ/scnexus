<script setup lang="ts">
import { onMounted, ref } from "vue";
import { set, useDropZone } from "@vueuse/core";
import { renderUnoIcon } from "@/composables/useIconRender";
import { CampaignInformationList, CampaignMetadataList } from "@/types";

const CAMPAIGN_LIST = {
  WOL: "自由之翼",
  HOTS: "虫群之心",
  LOTV: "虚空之遗",
  NCO: "诺娃隐秘行动",
};

const dropZoneRef = ref<HTMLDivElement>();

async function onDrop(files: File[] | null) {
  // called when files are dropped on zone
  console.log(files);
}

const { isOverDropZone } = useDropZone(dropZoneRef, onDrop);

const campaignCurrent = ref<CampaignMetadataList>({
  WOL: null,
  HOTS: null,
  LOTV: null,
  NCO: null,
  CUSTOM: null,
});

const campaignList = ref<CampaignInformationList>({
  WOL: null,
  HOTS: null,
  LOTV: null,
  NCO: null,
  CUSTOM: null,
});

async function updateCampaignCurrent() {
  const camapignCurrentData = await window.ipcRenderer.invoke(
    "getActiveCampaignMetadata"
  );
  console.log(camapignCurrentData);
  set(campaignCurrent, camapignCurrentData);
}

async function updateCampaignLists() {
  const camapignListData = await window.ipcRenderer.invoke(
    "updateCampaignLists"
  );
  set(campaignList, camapignListData);
  console.log(campaignList.value);
}

onMounted(() => {
  updateCampaignCurrent();
  updateCampaignLists();
});
</script>
<template>
  <div class="cm">
    <div class="flex flex-row justify-between items-center">
      <div class="header text-lg">{{ "战役管理" }}</div>
      <div class="operation flex flex-col justify-end">
        <n-button
          size="small"
          :render-icon="renderUnoIcon('i-tabler:refresh', { size: '12px' })"
          @click="updateCampaignLists()"
        >
          {{ "刷新战役列表" }}
        </n-button>
      </div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <div class="campaign-manager flex flex-row flex-wrap justify-center gap-2">
      <n-card
        v-for="(item, index) in CAMPAIGN_LIST"
        :key="index"
        class="w-[49%]"
        hoverable
      >
        <div class="h-full flex flex-col gap-2">
          <div class="self-center">{{ `《${item}》战役` }}</div>
          <n-divider :style="{ margin: 0 }" />
          <div
            v-if="!campaignCurrent[index]"
            class="flex flex-col items-center gap-1"
          >
            <div class="text-sm text-gray-500">
              {{ "当前战役·模组" }}
            </div>
            <div class="text-sm">
              {{ `《${item}》官方战役` }}
            </div>
            <div class="text-sm text-gray-500">
              {{ "（尚未激活任何战役）" }}
            </div>
          </div>
          <div
            v-if="!!campaignCurrent[index]"
            class="flex flex-col items-center gap-1"
          >
            <div class="text-sm text-gray-500">
              {{ "当前战役·模组" }}
            </div>
            <div class="text-sm">
              {{ campaignCurrent[index]?.name ?? "暂无战役" }}
            </div>
            <div
              class="flex flex-col justify-center items-center gap-1 text-sm text-gray-500"
            >
              <div>
                {{ "作者：" + campaignCurrent[index]?.author ?? "NULL" }}
              </div>
              <div>
                {{ "版本：" + campaignCurrent[index]?.version ?? "N/A" }}
              </div>
            </div>
          </div>
          <div class="mt-auto flex flex-row justify-center items-center gap-2">
            <n-button
              size="small"
              @click=""
              :render-icon="
                renderUnoIcon('i-tabler:player-play', { size: '12px' })
              "
            >
              {{ "游玩" }}
            </n-button>
            <n-button
              v-if="!campaignCurrent[index]"
              size="small"
              @click=""
              :render-icon="
                renderUnoIcon('i-tabler:table-options', { size: '12px' })
              "
            >
              {{ "激活新战役" }}
            </n-button>
            <n-button
              v-if="!!campaignCurrent[index]"
              size="small"
              @click=""
              :render-icon="renderUnoIcon('i-tabler:refresh', { size: '12px' })"
            >
              {{ "恢复官方战役" }}
            </n-button>
          </div>
        </div>
      </n-card>
    </div>
    <div class="file-drop-zone mt-2">
      <n-card ref="dropZoneRef" embedded hoverable>
        <div
          class="w-full h-15 flex flex-col justify-center items-center gap-y-2"
        >
          <div
            v-if="!isOverDropZone"
            class="flex flex-col items-center gap-y-1"
          >
            <div class="i-tabler:file-zip h-8 w-8"></div>
            <div class="text-sm text-gray-600">
              {{ "文件拖动至此（或点击选择文件）进行安装" }}
            </div>
            <div class="text-sm text-gray-500">
              {{ '请直接使用 ".zip" 压缩包文件' }}
            </div>
          </div>
          <div
            v-if="!!isOverDropZone"
            class="flex flex-col items-center gap-y-1"
          >
            <div class="i-tabler:file-download h-8 w-8"></div>
            <div class="text-sm text-gray-500">
              {{ "松开鼠标释放文件来开始安装" }}
            </div>
          </div>
        </div>
      </n-card>
    </div>
  </div>
</template>
