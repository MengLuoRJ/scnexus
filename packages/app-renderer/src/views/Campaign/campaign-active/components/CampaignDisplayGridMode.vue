<script lang="ts" setup>
import { inject } from "vue";
import { storeToRefs } from "pinia";

import { renderUnoIcon } from "@/composables/useIconRender";

import {
  CAMPAIGN_CONSTANTS,
  unactiveCampaign,
} from "@/views/campaign/composables/useCampaign";

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
            <div class="flex flex-row justify-center gap-1 text-sm">
              <div class="text-center text-black">
                {{ CAMPAIGN_SET[index]?.name ?? $t("campaign.no-campaign") }}
              </div>
              <n-badge
                v-if="!!CAMPAIGN_SET[index]?.version"
                :value="'v' + CAMPAIGN_SET[index]?.version"
              ></n-badge>
            </div>
            <div
              class="flex flex-col justify-center items-center gap-1 text-sm text-gray-500"
            >
              <div>
                <span>{{ $t("campaign.brief-mode.author") }}</span>
                <span>{{ CAMPAIGN_SET[index]?.author ?? "NULL" }}</span>
              </div>
            </div>
          </div>
          <div
            class="mt-auto flex flex-row justify-center items-center flex-wrap gap-1"
          >
            <n-button
              size="small"
              type="primary"
              @click=""
              :render-icon="
                renderUnoIcon('i-tabler:player-play', { size: '12px' })
              "
            >
              {{ $t("campaign.brief-mode.play") }}
            </n-button>
            <n-button
              v-if="!CAMPAIGN_SET[index]"
              size="small"
              type="info"
              @click="refDrawer?.hookupSwitchDrawer(item, index)"
              :render-icon="
                renderUnoIcon('i-tabler:table-options', { size: '12px' })
              "
            >
              {{ $t("campaign.brief-mode.active-campaign") }}
            </n-button>
            <n-button
              v-if="!!CAMPAIGN_SET[index]"
              size="small"
              type="info"
              @click="refDrawer?.hookupSwitchDrawer(item, index)"
              :render-icon="
                renderUnoIcon('i-tabler:status-change', {
                  size: '12px',
                })
              "
            >
              {{ $t("campaign.brief-mode.switch-campaign") }}
            </n-button>
            <n-button
              v-if="!!CAMPAIGN_SET[index]"
              size="small"
              type="info"
              @click="unactiveCampaign(CAMPAIGN_SET[index]!, item)"
              :render-icon="renderUnoIcon('i-tabler:refresh', { size: '12px' })"
            >
              {{ $t("campaign.brief-mode.restore-campaign") }}
            </n-button>
            <!-- 
              <n-button
                  v-if="!!CAMPAIGN_SET[index]"
                  size="small"
                  type="warning"
                  @click="uninstallCampaignType(index)"
                  :render-icon="
                    renderUnoIcon('i-tabler:trash', { size: '12px' })
                  "
                  :disabled="!checkCampaignUninstallable(index)"
                >
                  {{ $t("campaign.brief-mode.uninstall-campaign") }}
                </n-button> 
              -->
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
