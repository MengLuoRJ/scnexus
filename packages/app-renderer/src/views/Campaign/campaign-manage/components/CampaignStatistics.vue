<script lang="ts" setup>
import { useCampaignStore } from "@/stores/campaign";
import { type CampaignType } from "scnexus-standard/metadata";
import { get, set } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { reactive, ref } from "vue";
import { filesize } from "filesize";

import CampaignStatChart from "./CampaignStatChart.vue";

const campaignStore = useCampaignStore();
const { CAMPAIGN_LIST_SET } = storeToRefs(campaignStore);

import type { NumberAnimationInst } from "naive-ui";

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

defineExpose({
  computeInfoTotal,
});
</script>

<template>
  <div class="CampaignStatistics cell-normal hover:shadow">
    <div
      class="statistic-title flex justify-between items-center cursor-pointer"
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
            <span class="text-sm">
              {{ $t("campaign.campaign-stat.stat-campaigns-prefix") }}
            </span>
          </template>
          <template #suffix>
            <span class="text-sm">
              {{ $t("campaign.campaign-stat.stat-campaigns-suffix") }}
            </span>
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
            <span class="text-sm">
              {{ $t("campaign.campaign-stat.stat-filecount-prefix") }}
            </span>
          </template>
          <template #suffix>
            <span class="text-sm">
              {{ $t("campaign.campaign-stat.stat-filecount-prefix") }}
            </span>
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
            <span class="text-sm">
              {{ $t("campaign.campaign-stat.stat-filesize-prefix") }}
            </span>
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
            <span class="ml-1 text-sm">
              {{ $t("campaign.campaign-stat.stat-filesize-suffix") }}
            </span>
          </template>
        </n-statistic>
      </div>
      <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
      <div class="flex flex-row justify-between items-center gap-2">
        <CampaignStatChart :data="campaign_stat_total" />
      </div>
    </n-collapse-transition>
  </div>
</template>
