<script setup lang="ts">
import { useCampaignStore } from "@/stores/campaign";

import { storeToRefs } from "pinia";
import { filesize } from "filesize";
import { NImage } from "naive-ui";
import { ipcShell } from "@/apis/ipcs/shell";

import {
  activeCampaign,
  uninstallCampaign,
  checkCampaignSwitchable,
} from "@/views/campaign/composables/useCampaign";
import { useRouterGo } from "@/composables/useRouterGo";
import CampaignStatistics from "./components/CampaignStatistics.vue";

const campaignStore = useCampaignStore();
const { CAMPAIGN_LIST_SET } = storeToRefs(campaignStore);

const refCampaignStatistics = ref<InstanceType<typeof CampaignStatistics>>();
</script>
<template>
  <div class="campaign-management">
    <div class="flex flex-row justify-between items-center">
      <div
        class="header text-lg flex flex-row justify-start items-center gap-1"
      >
        <div
          class="cursor-pointer hover:text-green"
          @click="useRouterGo({ name: 'CampaignActive' })"
        >
          {{ $t("campaign.campaign-manager-title") }}
        </div>
        <div>{{ " / " }}</div>
        <div>{{ $t("campaign.campaign-detail-management") }}</div>
      </div>
      <div class="operation flex flex-row justify-end items-center gap-1">
        <n-button size="small">
          <template #icon>
            <div class="i-tabler:refresh"></div>
          </template>
          {{ $t("campaign.list-refresh") }}
        </n-button>
      </div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <CampaignStatistics ref="refCampaignStatistics" />
    <div class="campaign-list-management mt-2 cell-normal">
      <div>{{ $t("campaign.detail-management.detail-management-title") }}</div>
      <CampaignTabs v-slot="{ constant, index }">
        <div
          class="w-full flex flex-col justify-center items-stretch gap-2 mb-2"
        >
          <div
            v-for="(campaign, idx) in CAMPAIGN_LIST_SET[index]"
            :key="idx"
            class="flex flex-row justify-stretch gap-2 cell-normal hover:shadow"
          >
            <n-image
              :src="constant.thumbnail"
              :width="32"
              :height="32"
              preview-disabled
            />
            <div class="campaign-info flex flex-col">
              <div class="flex flex-row justify-start items-center gap-1">
                <div class="text-lg">{{ campaign.name }}</div>
                <n-tag type="success" size="small" round>
                  {{ "v" + campaign.version }}
                </n-tag>
                <n-tag
                  :type="campaign.manager === 'SCNexus' ? 'info' : undefined"
                  size="small"
                  round
                >
                  {{
                    $t("campaign.detail-mode.manager-format", {
                      manager: campaign.manager,
                    })
                  }}
                </n-tag>
              </div>
              <div class="text-sm">
                <span class="text-xs text-gray">
                  {{ $t("campaign.detail-management.author") }}
                </span>
                <span>{{ campaign.author }}</span>
              </div>
              <div class="text-sm">
                <span class="text-xs text-gray">
                  {{ $t("campaign.detail-management.description") }}
                </span>
                <span>{{ campaign.description }}</span>
              </div>
              <div v-if="campaign.localinfo" class="text-xs mt-1">
                <span class="text-gray">
                  {{ $t("campaign.detail-management.file-info") }}
                </span>
                <span v-if="campaign.localinfo.files_count">
                  {{
                    campaign.localinfo.files_count +
                    $t("campaign.detail-management.file-info-text")
                  }}
                </span>
                <span v-if="campaign.localinfo.files_size">
                  {{
                    " @ " +
                    filesize(campaign.localinfo.files_size, {
                      standard: "jedec",
                    })
                  }}
                </span>
              </div>
            </div>
            <div
              class="campaign-operation ml-auto self-end flex flex-col justify-start items-end gap-1"
            >
              <n-popover placement="left" trigger="hover" :show-arrow="false">
                <template #trigger>
                  <n-button
                    size="small"
                    :disabled="!checkCampaignSwitchable(campaign)"
                    @click="activeCampaign(campaign)"
                  >
                    <template #icon>
                      <div class="i-tabler:table-options"></div>
                    </template>
                    {{ $t("campaign.detail-management.active-campaign") }}
                  </n-button>
                </template>
                <span v-if="checkCampaignSwitchable(campaign)">
                  {{ $t("campaign.detail-management.active-campaign-tip") }}
                </span>
                <span v-else>
                  {{
                    $t("campaign.detail-management.active-campaign-tip-actived")
                  }}
                </span>
              </n-popover>
              <n-popover placement="left" trigger="hover" :show-arrow="false">
                <template #trigger>
                  <n-button
                    size="small"
                    :disabled="!campaign.localinfo.metadata_path"
                    @click="
                      ipcShell.showItemInFolder(
                        campaign.localinfo.metadata_path!
                      )
                    "
                  >
                    <template #icon>
                      <div class="i-tabler:folder-open"></div>
                    </template>
                    {{ $t("campaign.detail-management.check-in-explorer") }}
                  </n-button>
                </template>
                <span>
                  {{ $t("campaign.detail-management.check-in-explorer-tip") }}
                </span>
              </n-popover>
              <n-popover placement="left" trigger="hover" :show-arrow="false">
                <template #trigger>
                  <n-button
                    size="small"
                    @click="
                      uninstallCampaign(campaign).then(() => {
                        refCampaignStatistics?.computeInfoTotal();
                      })
                    "
                  >
                    <template #icon>
                      <div class="i-tabler:trash"></div>
                    </template>
                    {{ $t("campaign.detail-management.uninstall-campaign") }}
                  </n-button>
                </template>
                <span>
                  {{ $t("campaign.detail-management.uninstall-campaign-tip") }}
                </span>
              </n-popover>
            </div>
          </div>
        </div>
      </CampaignTabs>
    </div>
  </div>
</template>
