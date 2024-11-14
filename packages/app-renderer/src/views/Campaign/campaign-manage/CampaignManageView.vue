<script setup lang="ts">
import { renderUnoIcon } from "@/composables/useIconRender";
import { useCampaignStore } from "@/stores/campaign";
import { type CampaignType } from "scnexus-standard/metadata";
import { get, set } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { reactive, ref, h } from "vue";
import { filesize } from "filesize";
import { NImage, type NumberAnimationInst } from "naive-ui";
import { ipcShell } from "@/apis/ipcs/shell";

import CampaignStatChart from "./components/CampaignStatChart.vue";

import {
  activeCampaign,
  uninstallCampaign,
  checkCampaignSwitchable,
  CAMPAIGN_CONSTANTS,
} from "@/views/campaign/composables/useCampaign";
import router from "@/router";

const campaignStore = useCampaignStore();
const { CAMPAIGN_LIST_SET } = storeToRefs(campaignStore);

const showCampaignStat = ref(false);

const ref_NA_stat_campaigns = ref<NumberAnimationInst | null>(null);
const ref_NA_stat_filecount = ref<NumberAnimationInst | null>(null);
const ref_NA_stat_filesize = ref<NumberAnimationInst | null>(null);

const campaign_stat_total = reactive({
  total_campaign: 0,
  total_size: 0,
  total_file: 0,
  scnexus: {
    WOL: {
      total_size: 0,
      total_file: 0,
    },
    HOTS: {
      total_size: 0,
      total_file: 0,
    },
    LOTV: {
      total_size: 0,
      total_file: 0,
    },
    NCO: {
      total_size: 0,
      total_file: 0,
    },
  },
  ccm: {
    WOL: {
      total_size: 0,
      total_file: 0,
    },
    HOTS: {
      total_size: 0,
      total_file: 0,
    },
    LOTV: {
      total_size: 0,
      total_file: 0,
    },
    NCO: {
      total_size: 0,
      total_file: 0,
    },
  },
});

function computeInfoTotal() {
  // clean data
  campaign_stat_total.total_size = 0;
  campaign_stat_total.total_file = 0;
  campaign_stat_total.total_campaign = 0;
  const campaigns = ["WOL", "HOTS", "LOTV", "NCO"] as CampaignType[];
  for (const campaign of campaigns) {
    campaign_stat_total.scnexus[campaign].total_size = 0;
    campaign_stat_total.scnexus[campaign].total_file = 0;
    campaign_stat_total.ccm[campaign].total_size = 0;
    campaign_stat_total.ccm[campaign].total_file = 0;
  }
  // compute data
  for (const campaign of campaigns) {
    get(CAMPAIGN_LIST_SET)?.[campaign]?.forEach((item) => {
      campaign_stat_total.total_size += item.localinfo.files_size ?? 0;
      campaign_stat_total.total_file += item.localinfo.files_count ?? 0;
      campaign_stat_total.total_campaign++;
      if (item.manager === "SCNexus") {
        campaign_stat_total.scnexus[campaign].total_size +=
          item.localinfo.files_size ?? 0;
        campaign_stat_total.scnexus[campaign].total_file +=
          item.localinfo.files_count ?? 0;
      } else if (item.manager === "CCM") {
        campaign_stat_total.ccm[campaign].total_size +=
          item.localinfo.files_size ?? 0;
        campaign_stat_total.ccm[campaign].total_file +=
          item.localinfo.files_count ?? 0;
      }
    });
  }
  playNumberAnimation();
}

function playNumberAnimation() {
  ref_NA_stat_campaigns.value?.play();
  ref_NA_stat_filecount.value?.play();
  ref_NA_stat_filesize.value?.play();
}

function handleCampaignStatCollapse() {
  set(showCampaignStat, !get(showCampaignStat));
  if (get(showCampaignStat)) {
    computeInfoTotal();
  }
}

function goCampaignManagrRoot() {
  router.push("/campaign");
}
</script>
<template>
  <div class="campaign-management">
    <div class="flex flex-row justify-between items-center">
      <div
        class="header text-lg flex flex-row justify-start items-center gap-1"
      >
        <div
          class="cursor-pointer hover:text-green"
          @click="goCampaignManagrRoot()"
        >
          {{ $t("campaign.campaign-manager-title") }}
        </div>
        <div>{{ " / " }}</div>
        <div>{{ $t("campaign.campaign-detail-management") }}</div>
      </div>
      <div class="operation flex flex-row justify-end items-center gap-1">
        <n-button
          size="small"
          :render-icon="renderUnoIcon('i-tabler:refresh', { size: '12px' })"
        >
          {{ $t("campaign.list-refresh") }}
        </n-button>
      </div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <div class="campaign-stat cell-normal hover:shadow">
      <div
        class="stat-title flex justify-between items-center cursor-pointer"
        @click="handleCampaignStatCollapse"
      >
        <div>{{ $t("campaign.campaign-stat.total-stat-title") }}</div>
        <div
          v-if="!showCampaignStat"
          class="text-xl i-tabler:square-chevron-left"
        ></div>
        <div
          v-if="showCampaignStat"
          class="text-xl i-tabler:square-chevron-down"
        ></div>
      </div>
      <n-collapse-transition :show="showCampaignStat">
        <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
        <div class="flex flex-row justify-start items-baseline gap-2">
          <n-statistic tabular-nums>
            <n-number-animation
              ref="ref_NA_stat_campaigns"
              :from="0"
              :to="campaign_stat_total.total_campaign"
            />
            <template #prefix>
              <span class="text-sm">{{
                $t("campaign.campaign-stat.stat-campaigns-prefix")
              }}</span>
            </template>
            <template #suffix>
              <span class="text-sm">{{
                $t("campaign.campaign-stat.stat-campaigns-suffix")
              }}</span>
            </template>
          </n-statistic>
          <n-divider vertical />
          <n-statistic tabular-nums>
            <n-number-animation
              ref="ref_NA_stat_filecount"
              :from="0"
              :to="campaign_stat_total.total_file"
            />
            <template #prefix>
              <span class="text-sm">{{
                $t("campaign.campaign-stat.stat-filecount-prefix")
              }}</span>
            </template>
            <template #suffix>
              <span class="text-sm">{{
                $t("campaign.campaign-stat.stat-filecount-prefix")
              }}</span>
            </template>
          </n-statistic>
          <n-divider vertical />
          <n-statistic tabular-nums>
            <n-number-animation
              ref="ref_NA_stat_filesize"
              :from="0"
              :to="
                +filesize(campaign_stat_total.total_size, {
                  output: 'object',
                  standard: 'jedec',
                }).value
              "
            />
            <template #prefix>
              <span class="text-sm">{{
                $t("campaign.campaign-stat.stat-filesize-prefix")
              }}</span>
            </template>
            <template #suffix>
              <span>
                {{
                  filesize(campaign_stat_total.total_size, {
                    output: "object",
                    standard: "jedec",
                  }).symbol
                }}
              </span>
              <span class="ml-1 text-sm">{{
                $t("campaign.campaign-stat.stat-filesize-suffix")
              }}</span>
            </template>
          </n-statistic>
        </div>
        <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
        <div class="flex flex-row justify-between items-center gap-2">
          <CampaignStatChart :data="campaign_stat_total" />
        </div>
      </n-collapse-transition>
    </div>
    <div class="campaign-list-management mt-2 cell-normal">
      <div>{{ $t("campaign.detail-management.detail-management-title") }}</div>
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
                height="24"
                width="24"
                preview-disabled
              ></n-image>
              <div>{{ item.name }}</div>
            </div>
          </template>
          <div
            class="w-full flex flex-col justify-center items-stretch gap-2 mb-2"
          >
            <div
              v-for="(campaign, idx) in CAMPAIGN_LIST_SET[index]"
              :key="idx"
              class="flex flex-row justify-stretch gap-2 cell-normal hover:shadow"
            >
              <div class="campaign-icon">
                <n-image
                  :src="item.thumbnail"
                  preview-disabled
                  :width="32"
                  :height="32"
                />
              </div>
              <div class="campaign-info flex flex-col">
                <div class="flex flex-row justify-start items-center gap-1">
                  <div class="text-lg">{{ campaign.name }}</div>
                  <n-badge
                    v-if="!!campaign.version"
                    :value="'v' + campaign.version"
                  ></n-badge>
                  <n-badge
                    v-if="campaign.manager !== 'SCNexus'"
                    type="info"
                    :value="
                      $t('campaign.detail-management.ccm-format', {
                        manager: campaign.manager,
                      })
                    "
                  ></n-badge>
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
                      @click="activeCampaign(campaign)"
                      :render-icon="
                        renderUnoIcon('i-tabler:table-options', {
                          size: '16px',
                        })
                      "
                      :disabled="!checkCampaignSwitchable(campaign)"
                    >
                      {{ $t("campaign.detail-management.active-campaign") }}
                    </n-button>
                  </template>
                  <span v-if="checkCampaignSwitchable(campaign)">
                    {{ $t("campaign.detail-management.active-campaign-tip") }}
                  </span>
                  <span v-else>
                    {{
                      $t(
                        "campaign.detail-management.active-campaign-tip-actived"
                      )
                    }}
                  </span>
                </n-popover>
                <n-popover placement="left" trigger="hover" :show-arrow="false">
                  <template #trigger>
                    <n-button
                      size="small"
                      @click="
                        ipcShell.showItemInFolder(
                          campaign.localinfo.metadata_path!
                        )
                      "
                      :render-icon="
                        renderUnoIcon('i-tabler:folder-open', {
                          size: '16px',
                        })
                      "
                      :disabled="!campaign.localinfo.metadata_path"
                    >
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
                          computeInfoTotal();
                        })
                      "
                      :render-icon="
                        renderUnoIcon('i-tabler:trash', { size: '16px' })
                      "
                    >
                      {{ $t("campaign.detail-management.uninstall-campaign") }}
                    </n-button>
                  </template>
                  <span>
                    {{
                      $t("campaign.detail-management.uninstall-campaign-tip")
                    }}
                  </span>
                </n-popover>
              </div>
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>
    </div>
  </div>
</template>
