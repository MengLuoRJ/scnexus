import {
  LocalProfile,
  ProfileCampaign,
  ProfileCustomize,
  ProfileDocuments,
  ProfileGame,
} from "@shared/types/profile";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  getProfile as getProfileIpc,
  initProfile as initProfileIpc,
} from "@/composables/useIpcHost/useSettingIpc";
import { get, set } from "@vueuse/core";

export const useLocalProfileStore = defineStore(
  "local-profile",
  () => {
    const SUCCESS = ref(false);
    const ERROR_MESSAGE = ref<string | undefined>(undefined);
    const PATH_WHITE_LIST = ref<string[] | undefined>(undefined);
    const PROFILE_GAME = ref<ProfileGame>();
    const PROFILE_DOCUMENTS = ref<ProfileDocuments>();
    const PROFILE_CAMPAIGN = ref<ProfileCampaign>();
    const PROFILE_CUSTOMIZE = ref<ProfileCustomize>();

    const getProfile = async () => {
      const profile = await getProfileIpc();
      if (profile) {
        set(SUCCESS, profile.SUCCESS);
        set(ERROR_MESSAGE, profile.ERROR_MESSAGE);
        set(PATH_WHITE_LIST, profile.PATH_WHITE_LIST);
        set(PROFILE_GAME, profile.PROFILE_GAME);
        set(PROFILE_DOCUMENTS, profile.PROFILE_DOCUMENTS);
        set(PROFILE_CAMPAIGN, profile.PROFILE_CAMPAIGN);
        set(PROFILE_CUSTOMIZE, profile.PROFILE_CUSTOMIZE);
      }
    };

    const initProfile = async (path?: string) => {
      const profile = await initProfileIpc(path);
      if (profile) {
        set(SUCCESS, profile.SUCCESS);
        set(ERROR_MESSAGE, profile.ERROR_MESSAGE);
        set(PATH_WHITE_LIST, profile.PATH_WHITE_LIST);
        set(PROFILE_GAME, profile.PROFILE_GAME);
        set(PROFILE_DOCUMENTS, profile.PROFILE_DOCUMENTS);
        set(PROFILE_CAMPAIGN, profile.PROFILE_CAMPAIGN);
        set(PROFILE_CUSTOMIZE, profile.PROFILE_CUSTOMIZE);
      }
    };

    const getSUCCESS = computed(() => {
      return get(SUCCESS);
    });

    return {
      SUCCESS,
      ERROR_MESSAGE,
      PATH_WHITE_LIST,
      PROFILE_GAME,
      PROFILE_DOCUMENTS,
      PROFILE_CAMPAIGN,
      PROFILE_CUSTOMIZE,
      getSUCCESS,
      getProfile,
      initProfile,
    };
  },
  { persist: true }
);
