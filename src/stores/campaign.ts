import { ref } from "vue";
import { defineStore } from "pinia";
import { CampaignInformationListSet } from "@shared/types";

export const useCamapignStore = defineStore(
  "campaign",
  () => {
    const LAST_REFRESH_TIME = ref<number>(0);
    const CAMPAIGN_LIST_SET = ref<CampaignInformationListSet>({
      WOL: [],
      HOTS: [],
      LOTV: [],
      NCO: [],
    });
    return { LAST_REFRESH_TIME, CAMPAIGN_LIST_SET };
  },
  { persist: true }
);
