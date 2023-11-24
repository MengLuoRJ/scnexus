import { ref } from "vue";
import { defineStore } from "pinia";
import { CustomizeInformationList } from "@shared/types";

export const useCustomizeStore = defineStore(
  "customize",
  () => {
    const LAST_REFRESH_TIME = ref<number>(0);
    const CUSTOMIZE_LIST = ref<CustomizeInformationList>([]);
    return { LAST_REFRESH_TIME, CUSTOMIZE_LIST };
  },
  { persist: true }
);
