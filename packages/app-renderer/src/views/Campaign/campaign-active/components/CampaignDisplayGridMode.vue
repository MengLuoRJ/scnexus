<script lang="ts" setup>
import { inject } from "vue";
import { storeToRefs } from "pinia";

import { renderUnoIcon } from "@/composables/useIconRender";

import {
  CAMPAIGN_CONSTANTS,
  unactiveCampaign,
} from "@/views/campaign/composables/useCampaign";

import StartButton from "@/components/StartButton";
import CustomizeDropZone from "@/components/CustomizeDropZone";
import CampaignSwitchDrawer from "./CampaignSwitchDrawer.vue";

import { useCampaignActiveStore } from "@/stores/campaign-active";

const campaignActiveStore = useCampaignActiveStore();
const { CAMPAIGN_SET } = storeToRefs(campaignActiveStore);

const refDrawer =
  inject<InstanceType<typeof CampaignSwitchDrawer>>("refDrawer");
</script>
<template>
  <div class="campaign-manager -grid flex flex-col">
    <div class="flex flex-row flex-wrap justify-center gap-2">
      <n-card
        v-for="(item, index) in CAMPAIGN_CONSTANTS"
        :key="index"
        class="w-[49%]"
        hoverable
      >
        <div class="h-full flex flex-col gap-2">
          <div class="self-center">
            {{ $t("campaign.brief-mode.campaign", { campaign: item.name }) }}
          </div>
          <n-divider :style="{ margin: 0 }" />
          <div
            v-if="!CAMPAIGN_SET[index]"
            class="flex flex-col items-center gap-1"
          >
            <div class="text-sm text-gray-500">
              {{ $t("campaign.current-campaign") }}
            </div>
            <div class="text-sm">
              {{ $t("campaign.offcial-campaign", { campaign: item.name }) }}
            </div>
            <div class="text-sm text-gray-500">
              {{ $t("campaign.no-actived-campaign") }}
            </div>
          </div>
          <div
            v-if="!!CAMPAIGN_SET[index]"
            class="flex flex-col items-center gap-1"
          >
            <div class="text-sm text-gray-500">
              {{ $t("campaign.current-campaign") }}
            </div>
            <div class="text-center text-sm">
              <span class="mx-2 text-black">
                {{ CAMPAIGN_SET[index]?.name ?? $t("campaign.no-campaign") }}
              </span>
              <n-tag type="success" size="small" round>
                {{ "v" + CAMPAIGN_SET[index]?.version }}
              </n-tag>
            </div>
            <div class="text-sm text-gray-500">
              <span>{{ $t("campaign.brief-mode.author") }}</span>
              <span>
                {{ CAMPAIGN_SET[index]?.author ?? "NULL" }}
              </span>
            </div>
          </div>
          <div
            class="mt-auto flex flex-row justify-center items-center flex-wrap gap-1"
          >
            <!-- <n-button size="small" type="primary" @click="">
              <template #icon>
                <div class="i-tabler:player-play"></div>
              </template>
              {{ $t("campaign.brief-mode.play") }}
            </n-button> -->
            <StartButton type="campaign" size="small" />
            <n-button
              v-if="!CAMPAIGN_SET[index]"
              size="small"
              type="info"
              @click="refDrawer?.hookupSwitchDrawer(item, index)"
            >
              <template #icon>
                <div class="i-tabler:table-options"></div>
              </template>
              {{ $t("campaign.brief-mode.active-campaign") }}
            </n-button>
            <n-button
              v-if="!!CAMPAIGN_SET[index]"
              size="small"
              type="info"
              @click="refDrawer?.hookupSwitchDrawer(item, index)"
            >
              <template #icon>
                <div class="i-tabler:status-change"></div>
              </template>
              {{ $t("campaign.brief-mode.switch-campaign") }}
            </n-button>
            <n-button
              v-if="!!CAMPAIGN_SET[index]"
              size="small"
              type="info"
              @click="unactiveCampaign(CAMPAIGN_SET[index]!, item)"
            >
              <template #icon>
                <div class="i-tabler:refresh"></div>
              </template>
              {{ $t("campaign.brief-mode.restore-campaign") }}
            </n-button>
          </div>
        </div>
      </n-card>
    </div>
    <n-divider :style="{ margin: '0.5rem 0 0 0' }" />
    <div class="file-drop-zone mt-2">
      <CustomizeDropZone />
    </div>
  </div>
</template>
