import { ref } from "vue";
import { set } from "@vueuse/core";
import { defineStore } from "pinia";

import { ipcProfile } from "@/apis/ipcs/profile";

import type {
  ProfileCampaign,
  ProfileCustomize,
  ProfileDocuments,
  ProfileGame,
} from "@scnexus/app-shared/types/profile.type";
import { emitterEmit } from "@/composables/useMitt";

export const useProfileStore = defineStore(
  "profile-store",
  () => {
    const SUCCESS = ref(false);
    const ERROR_MESSAGE = ref<string | undefined>(undefined);
    const PATH_WHITE_LIST = ref<string[] | undefined>(undefined);
    const PROFILE_GAME = ref<ProfileGame>();
    const PROFILE_DOCUMENTS = ref<ProfileDocuments>();
    const PROFILE_CAMPAIGN = ref<ProfileCampaign>();
    const PROFILE_CUSTOMIZE = ref<ProfileCustomize>();

    const getProfile = async () => {
      const { data } = await ipcProfile.getProfile();
      if (data) {
        set(SUCCESS, data.SUCCESS);
        set(ERROR_MESSAGE, data.ERROR_MESSAGE);
        set(PATH_WHITE_LIST, data.PATH_WHITE_LIST);
        set(PROFILE_GAME, data.PROFILE_GAME);
        set(PROFILE_DOCUMENTS, data.PROFILE_DOCUMENTS);
        set(PROFILE_CAMPAIGN, data.PROFILE_CAMPAIGN);
        set(PROFILE_CUSTOMIZE, data.PROFILE_CUSTOMIZE);
      }
    };

    const initProfile = async (path?: string) => {
      const { data } = await ipcProfile.initGameService(path);
      if (data) {
        set(SUCCESS, data.SUCCESS);
        set(ERROR_MESSAGE, data.ERROR_MESSAGE);
        set(PATH_WHITE_LIST, data.PATH_WHITE_LIST);
        set(PROFILE_GAME, data.PROFILE_GAME);
        set(PROFILE_DOCUMENTS, data.PROFILE_DOCUMENTS);
        set(PROFILE_CAMPAIGN, data.PROFILE_CAMPAIGN);
        set(PROFILE_CUSTOMIZE, data.PROFILE_CUSTOMIZE);
        emitterEmit("profile-initialized-success");
      }
    };

    return {
      SUCCESS,
      ERROR_MESSAGE,
      PATH_WHITE_LIST,
      PROFILE_GAME,
      PROFILE_DOCUMENTS,
      PROFILE_CAMPAIGN,
      PROFILE_CUSTOMIZE,
      getProfile,
      initProfile,
    };
  },
  { persist: true }
);
