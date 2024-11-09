import { ref } from "vue";
import { defineStore } from "pinia";
import type { MetadataInformatedCampaignSet } from "scnexus-standard/metadata";

export const useCampaignActiveStore = defineStore(
  "campaign-active",
  () => {
    const LAST_REFRESH_TIME = ref<number>(0);
    const CAMPAIGN_SET = ref<MetadataInformatedCampaignSet>({
      WOL: undefined,
      HOTS: undefined,
      LOTV: undefined,
      NCO: undefined,
    });
    return { LAST_REFRESH_TIME, CAMPAIGN_SET };
  },
  { persist: true }
);
