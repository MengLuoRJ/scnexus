import { ref } from "vue";
import { defineStore } from "pinia";
import type { MetadataInformatedCampaignListSet } from "scnexus-standard/metadata";

export const useCampaignStore = defineStore(
  "campaign",
  () => {
    const LAST_REFRESH_TIME = ref<number>(0);
    const CAMPAIGN_LIST_SET = ref<MetadataInformatedCampaignListSet>({
      WOL: [],
      HOTS: [],
      LOTV: [],
      NCO: [],
    });
    return { LAST_REFRESH_TIME, CAMPAIGN_LIST_SET };
  },
  { persist: true }
);
