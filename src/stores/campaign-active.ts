import { ref } from "vue";
import { defineStore } from "pinia";
import { CampaignInformationSet } from "@shared/types";

export const useCampaignActiveStore = defineStore(
  "campaign-active",
  () => {
    const LAST_REFRESH_TIME = ref<number>(0);
    const CAMPAIGN_SET = ref<CampaignInformationSet>({
      WOL: undefined,
      HOTS: undefined,
      LOTV: undefined,
      NCO: undefined,
    });
    return { LAST_REFRESH_TIME, CAMPAIGN_SET };
  },
  { persist: true }
);
