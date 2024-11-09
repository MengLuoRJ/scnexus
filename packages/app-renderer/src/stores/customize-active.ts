import { ref } from "vue";
import { defineStore } from "pinia";
import type { MetadataInformated } from "scnexus-standard/metadata";

export const useCustomizeActiveStore = defineStore(
  "customize-active",
  () => {
    const LAST_REFRESH_TIME = ref<number>(0);
    const CUSTOMIZE_LIST = ref<MetadataInformated[]>([]);
    return { LAST_REFRESH_TIME, CUSTOMIZE_LIST };
  },
  { persist: true }
);
