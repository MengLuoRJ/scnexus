<script lang="ts" setup>
import { h, inject } from "vue";
import { storeToRefs } from "pinia";
import { NImage } from "naive-ui";

import { renderUnoIcon } from "@/composables/useIconRender";

import {
  CAMPAIGN_CONSTANTS,
  unactiveCampaign,
  uninstallCampaign,
} from "@/views/campaign/composables/useCampaign";
import Campaign_thumbnail from "@/assets/campaign/Campaign_thumbnail.png";

import StartButton from "@/components/StartButton";
import CustomizeDropZone from "@/components/CustomizeDropZone";
import IconTooltip from "@/components/IconTooltip.vue";
import ExternalLinkTooltip from "@/components/ExternalLinkTooltip.vue";
import SupportIcon from "@/components/SupportIcon.vue";
import EditorIcon from "@/assets/campaign/EditorIcon.vue";

import CampaignSwitchDrawer from "./CampaignSwitchDrawer.vue";

import { useCampaignActiveStore } from "@/stores/campaign-active";
import { ipcCustomize } from "@/apis/ipcs/customize";

const campaignActiveStore = useCampaignActiveStore();
const { CAMPAIGN_SET } = storeToRefs(campaignActiveStore);

const refDrawer =
  inject<InstanceType<typeof CampaignSwitchDrawer>>("refDrawer");

const runGame = async () => {
  await ipcCustomize.runGameClient();
};
</script>
<template>
  <div class="campaign-manager -list">
    <n-tabs type="line" animated>
      <n-tab-pane
        v-for="(item, index) in CAMPAIGN_CONSTANTS"
        :key="index"
        :name="index"
      >
        <template #tab>
          <div class="flex flex-row justify-start items-center gap-1">
            <n-image
              :src="item.thumbnail"
              :fallbackSrc="Campaign_thumbnail"
              height="24"
              width="24"
              preview-disabled
            ></n-image>
            <div>{{ item.name }}</div>
          </div>
        </template>
        <div
          class="p-2 rounded-2 bg-cover bg-no-repeat"
          :style="{ backgroundImage: `url(${item.banner})` }"
        >
          <div class="flex flex-row gap-2">
            <div
              class="basis-2/5 flex flex-col justify-center items-center gap-1 py-2 border border-gray-200 border-solid rounded-2 bg-white/75 backdrop-blur-sm"
            >
              <n-image
                :src="item.logo"
                preview-disabled
                height="125"
                class="mt--6"
              ></n-image>
              <div class="self-center mt--6">
                {{
                  $t("campaign.detail-mode.campaign-title", {
                    campaign: item.name,
                  })
                }}
              </div>
              <n-divider :style="{ margin: 0 }" />
              <div class="flex flex-col items-center gap-1">
                <div class="text-sm text-gray-500">
                  {{ $t("campaign.current-campaign") }}
                </div>
                <div v-if="!CAMPAIGN_SET[index]" class="text-sm text-gray-500">
                  {{ $t("campaign.no-actived-campaign") }}
                </div>
                <div
                  v-else
                  class="flex flex-col justify-center items-center gap-1 text-sm"
                >
                  <div class="text-center text-black">
                    {{
                      CAMPAIGN_SET[index]?.name ?? $t("campaign.no-campaign")
                    }}
                  </div>
                  <div class="flex flex-row justify-center items-center gap-1">
                    <n-badge
                      v-if="!!CAMPAIGN_SET[index]?.version"
                      :value="'v' + CAMPAIGN_SET[index]?.version"
                    ></n-badge>
                    <n-badge
                      v-if="CAMPAIGN_SET[index]?.manager !== 'SCNexus'"
                      type="info"
                    >
                      <template #value>
                        {{
                          $t("campaign.detail-mode.manager-format", {
                            manager: CAMPAIGN_SET[index]?.manager,
                          })
                        }}
                      </template>
                    </n-badge>
                  </div>
                </div>
              </div>
              <n-divider :style="{ margin: 0 }" />
              <div
                class="mt-auto flex flex-col justify-center items-center gap-1"
              >
                <n-button
                  v-if="!CAMPAIGN_SET[index]"
                  size="small"
                  block
                  @click="refDrawer?.hookupSwitchDrawer(item, index)"
                  :render-icon="renderUnoIcon('i-tabler:table-options')"
                >
                  {{ $t("campaign.detail-mode.active-campaign") }}
                </n-button>
                <n-button
                  v-if="!!CAMPAIGN_SET[index]"
                  size="small"
                  block
                  @click="unactiveCampaign(CAMPAIGN_SET[index]!, item)"
                  :render-icon="
                    renderUnoIcon('i-tabler:refresh', { size: '12px' })
                  "
                >
                  {{ $t("campaign.detail-mode.restore-campaign") }}
                </n-button>
                <n-button
                  v-if="!!CAMPAIGN_SET[index]"
                  size="small"
                  block
                  @click="refDrawer?.hookupSwitchDrawer(item, index)"
                  :render-icon="
                    renderUnoIcon('i-tabler:status-change', {
                      size: '12px',
                    })
                  "
                >
                  {{ $t("campaign.detail-mode.switch-campaign") }}
                </n-button>
                <n-button
                  v-if="!!CAMPAIGN_SET[index]"
                  size="small"
                  block
                  @click="uninstallCampaign(CAMPAIGN_SET[index])"
                  :render-icon="
                    renderUnoIcon('i-tabler:trash', { size: '12px' })
                  "
                >
                  {{ $t("campaign.detail-mode.uninstall-campaign") }}
                </n-button>
                <StartButton type="campaign" />
              </div>
            </div>
            <div
              class="basis-3/5 flex flex-col gap-1 cell-normal bg-white/75 backdrop-blur-sm"
            >
              <div
                class="cell-normal mt-1 mx-1 px-2 py-1 hover:transition-shadow duration-300 hover:shadow"
              >
                <div class="text-xs text-gray">
                  {{ $t("campaign.detail-mode.now-playing") }}
                </div>
                <div v-if="!!CAMPAIGN_SET[index]" class="text-base">
                  {{ CAMPAIGN_SET[index]?.name }}
                </div>
                <div v-if="!!CAMPAIGN_SET[index]" class="text-sm text-gray">
                  {{
                    $t("campaign.detail-mode.campaign", {
                      campaign: item.name,
                    })
                  }}
                </div>
                <div v-else class="text-base">
                  {{ $t("campaign.offcial-campaign", { campaign: item.name }) }}
                </div>
              </div>
              <div
                v-if="!!CAMPAIGN_SET[index]"
                class="flex flex-row gap-2 mx-1"
              >
                <div
                  class="basis-1/2 flex flex-row justify-start items-center gap-1 px-2 py-1 cell-normal hover:transition-shadow duration-300 hover:shadow"
                >
                  <div class="text-xs text-gray">
                    {{ $t("campaign.detail-mode.author") }}
                  </div>
                  <div class="text-sm">
                    {{ CAMPAIGN_SET[index]?.author }}
                  </div>
                </div>
                <div
                  class="basis-1/2 flex flex-row justify-start items-center gap-1 px-2 py-1 cell-normal hover:transition-shadow duration-300 hover:shadow"
                >
                  <div class="text-xs text-gray">
                    {{ $t("campaign.detail-mode.version") }}
                  </div>
                  <div class="text-sm">
                    {{
                      CAMPAIGN_SET[index]?.version
                        ? "v" + CAMPAIGN_SET[index]?.version
                        : "N/A"
                    }}
                  </div>
                </div>
              </div>
              <div
                v-if="!!CAMPAIGN_SET[index]"
                class="cell-normal mx-1 px-2 py-1 hover:transition-shadow duration-300 hover:shadow"
              >
                <div class="text-xs text-gray">
                  {{ $t("campaign.detail-mode.description") }}
                </div>
                <div v-if="!!CAMPAIGN_SET[index]" class="text-sm">
                  {{ CAMPAIGN_SET[index]?.description }}
                </div>
              </div>
              <div
                v-if="!!CAMPAIGN_SET[index]?.social"
                class="flex flex-row gap-2 mx-1"
              >
                <div
                  class="basis-1/2 px-2 py-1 cell-normal hover:transition-shadow duration-300 hover:shadow"
                >
                  <div class="text-xs text-gray">
                    {{ $t("campaign.detail-mode.social") }}
                  </div>
                  <div
                    class="mt-1 flex flex-row justify-start items-center gap-1 text-sm"
                  >
                    <SupportIcon
                      v-if="!!CAMPAIGN_SET[index]?.social?.twitter"
                      :link="CAMPAIGN_SET[index]?.social?.twitter!"
                      preset="twitter"
                    />
                    <SupportIcon
                      v-if="!!CAMPAIGN_SET[index]?.social?.discord"
                      :link="CAMPAIGN_SET[index]?.social?.discord!"
                      preset="discord"
                    />
                    <SupportIcon
                      v-if="!!CAMPAIGN_SET[index]?.social?.youtube"
                      :link="CAMPAIGN_SET[index]?.social?.youtube!"
                      preset="youtube"
                    />
                    <SupportIcon
                      v-if="!!CAMPAIGN_SET[index]?.social?.weibo"
                      :link="CAMPAIGN_SET[index]?.social?.weibo!"
                      preset="weibo"
                    />
                    <SupportIcon
                      v-if="!!CAMPAIGN_SET[index]?.social?.bilibili"
                      :link="CAMPAIGN_SET[index]?.social?.bilibili!"
                      preset="bilibili"
                    />
                    <SupportIcon
                      v-if="!!CAMPAIGN_SET[index]?.social?.qq_group"
                      :link="CAMPAIGN_SET[index]?.social?.qq_group!"
                      preset="qq_group"
                    />
                  </div>
                </div>
                <div
                  class="basis-1/2 px-2 py-1 cell-normal hover:transition-shadow duration-300 hover:shadow"
                >
                  <div class="text-xs text-gray">
                    {{ $t("campaign.detail-mode.donate") }}
                  </div>
                  <div class="text-sm">
                    <div
                      class="mt-1 flex flex-row justify-start items-center gap-1 text-sm"
                    >
                      <SupportIcon
                        v-if="!!CAMPAIGN_SET[index]?.sponsor?.paypal"
                        :link="CAMPAIGN_SET[index]?.sponsor?.paypal!"
                        preset="paypal"
                      />
                      <SupportIcon
                        v-if="!!CAMPAIGN_SET[index]?.sponsor?.patreon"
                        :link="CAMPAIGN_SET[index]?.sponsor?.patreon!"
                        preset="patreon"
                      />
                      <SupportIcon
                        v-if="!!CAMPAIGN_SET[index]?.sponsor?.buymeacoffee"
                        :link="CAMPAIGN_SET[index]?.sponsor?.buymeacoffee!"
                        preset="buymeacoffee"
                      />
                      <SupportIcon
                        v-if="!!CAMPAIGN_SET[index]?.sponsor?.afdian"
                        :link="CAMPAIGN_SET[index]?.sponsor?.afdian!"
                        preset="afdian"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div
                v-if="!!CAMPAIGN_SET[index]?.website"
                class="cell-normal mx-1 px-2 py-1 hover:transition-shadow duration-300 hover:shadow"
              >
                <div class="text-xs text-gray">
                  {{ $t("campaign.detail-mode.website") }}
                </div>
                <ExternalLinkTooltip
                  :link="CAMPAIGN_SET[index]?.website!"
                  clamp
                />
              </div>
              <div
                v-if="!!CAMPAIGN_SET[index]?.snid"
                class="flex flex-row justify-start items-center gap-2 cell-normal mx-1 px-2 py-1 hover:transition-shadow duration-300 hover:shadow"
              >
                <div class="text-xs text-gray">
                  {{ $t("campaign.detail-mode.snid") }}
                </div>
                <div v-if="!!CAMPAIGN_SET[index]" class="text-xs">
                  {{
                    CAMPAIGN_SET[index]?.snid ??
                    $t("campaign.detail-mode.snid-none")
                  }}
                </div>
              </div>
              <n-alert
                v-if="!CAMPAIGN_SET[index]"
                class="mx-1"
                :title="$t('campaign.detail-mode.no-actived-campaign')"
                type="info"
              >
                <div class="text-xs">
                  {{
                    $t("campaign.detail-mode.no-actived-campaign-offial-tip")
                  }}
                </div>
                <div class="text-xs">
                  {{
                    $t("campaign.detail-mode.no-actived-campaign-content-tip")
                  }}
                </div>
              </n-alert>
              <div class="mt-auto mb-1 mx-1">
                <CustomizeDropZone />
              </div>
            </div>
          </div>
        </div>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>
