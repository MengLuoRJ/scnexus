import { defineStore } from "pinia";
import { ref } from "vue";

export const usePresetStore = defineStore(
  "preset",
  () => {
    const campaign_display_mode = ref<"grid" | "list">("list");

    return {
      campaign_display_mode,
    };
  },
  { persist: true }
);
