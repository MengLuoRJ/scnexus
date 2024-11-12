<script setup lang="ts">
import { ref } from "vue";
import { set } from "@vueuse/core";
import type { CampaignType, MetadataInformated } from "scnexus-standard/metadata";
import {
  type CampaignConstant,
  checkCampaignSwitchable,
  uninstallCampaign,
  activeCampaign,
} from "../composables/useCampaign";
import { renderUnoIcon } from "@/composables/useIconRender";

import Campaign_thumbnail from "@/assets/campaign/Campaign_thumbnail.png";
import { useCampaignStore } from "@/stores/campaign";

const campaignStore = useCampaignStore();

const show = ref(false);
const campaignConstant = ref<CampaignConstant>();
const campaignList = ref<MetadataInformated[]>([]);

function hookupSwitchDrawer(
  constant: CampaignConstant,
  campaign: CampaignType
) {
  set(campaignConstant, constant);
  console.log(campaignStore.CAMPAIGN_LIST_SET);
  set(campaignList, campaignStore.CAMPAIGN_LIST_SET[campaign]);
  set(show, true);
}

defineExpose({ hookupSwitchDrawer });
</script>
<template>
  <n-drawer v-model:show="show" :width="351">
    <n-drawer-content :body-content-style="{ padding: '0px' }" closable>
      <template #header>
        <div class="flex flex-row justify-start items-center gap-1">
          <n-image
            :src="campaignConstant?.thumbnail"
            :fallbackSrc="Campaign_thumbnail"
            height="24"
            width="24"
            previewDisabled
          />
          <div>
            {{
              $t("campaign.switch-drawer.campaign", {
                campaign: campaignConstant?.name,
              })
            }}
          </div>
        </div>
      </template>
      <div class="mt-2 mx-1 flex flex-col gap-1">
        <div
          class="px-2 py-1 cell-normal hover:shadow"
          :class="checkCampaignSwitchable(item) ? '' : ' bg-gray-100'"
          v-for="(item, index) in campaignList"
          :key="index"
        >
          <div class="flex flex-row gap-1">
            <div class="flex flex-col">
              <div class="text-base">{{ item.name }}</div>
              <div class="flex flex-row justify-start gap-1">
                <div class="text-sm text-gray">
                  <span> {{ $t("campaign.switch-drawer.author") }}</span>
                  <span> {{ item.author ?? "NULL" }}</span>
                </div>
              </div>
              <div class="mt-1 flex flex-row justify-start gap-1">
                <n-badge :value="'v' + item.version"></n-badge>
                <n-badge
                  type="info"
                  :value="
                    $t('campaign.switch-drawer.manager-format', {
                      manager: item.manager,
                    })
                  "
                ></n-badge>
              </div>
            </div>
            <div class="ml-auto flex flex-row gap-1 justify-end items-center">
              <n-popover placement="bottom" trigger="hover" :show-arrow="false">
                <template #trigger>
                  <n-button
                    size="small"
                    @click="uninstallCampaign(item).then(() => (show = false))"
                    :render-icon="
                      renderUnoIcon('i-tabler:trash', { size: '16px' })
                    "
                  >
                  </n-button>
                </template>
                <span>
                  {{ $t("campaign.switch-drawer.uninstall-campaign") }}
                </span>
              </n-popover>
              <n-popover placement="bottom" trigger="hover" :show-arrow="false">
                <template #trigger>
                  <n-button
                    size="small"
                    @click="activeCampaign(item).then(() => (show = false))"
                    :render-icon="
                      renderUnoIcon('i-tabler:table-options', {
                        size: '16px',
                      })
                    "
                    :disabled="!checkCampaignSwitchable(item)"
                  >
                  </n-button>
                </template>
                <span>{{ $t("campaign.switch-drawer.active-campaign") }}</span>
              </n-popover>
            </div>
          </div>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>
