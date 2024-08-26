import { ref } from "vue";
import { defineStore } from "pinia";

export const useCreatorStore = defineStore(
  "creator",
  () => {
    const profile = ref({
      uuid: "",
      name: "",
      description: "",
      verfied_title: "",
      is_verified: false,
      is_banned: false,
      capacity_total: 0,
      capacity_used: 0,
    });
    return { profile };
  },
  { persist: false }
);
