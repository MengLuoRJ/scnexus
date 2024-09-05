import { ipcSetting } from "@/apis/ipcs/setting";
import { ref } from "vue";
import { defineStore } from "pinia";
import { get, set } from "@vueuse/core";
import { useGet, usePost } from "@/composables/useRequest";
import { useFetch } from "@/composables/useFetch";

export type StarcraftProfile = {
  uuid: string;
  profile_id: string;
  name: string;
  region_id: number;
  realm_id: number;
  profile_url: string;
  avatar_url: string;
  player_handle: string;
  is_banned: boolean;
};

export const useUserStore = defineStore(
  "user",
  () => {
    const client_id = ref("");

    const access_token = ref("");
    const refresh_token = ref("");

    const logined = ref(false);
    const uuid = ref("");
    const username = ref("");
    const roles = ref<string[]>([]);

    const profiles = ref<StarcraftProfile[]>([]);

    const safeguard = ref({
      email_verified: false,
      telnum_verified: false,
    });

    async function clearUser() {
      set(access_token, "");
      set(refresh_token, "");
      set(logined, false);
      set(uuid, "");
      set(username, "");
      set(roles, []);
      set(profiles, []);
      set(safeguard, {
        email_verified: false,
        telnum_verified: false,
      });
      await ipcSetting.setTrackerUser({
        client_id: get(client_id),
      });
    }

    async function requestProfiles() {
      const { data } = await useFetch(
        "/starcraft/profile/user/" + get(uuid)
      ).json();
      if (get(data)) {
        set(profiles, get(data));
      }
    }

    async function syncLoginStatus() {
      if (get(access_token) && get(refresh_token)) {
        const { data, error } = await useFetch("/authentication/challenge")
          .post()
          .json();
        if (get(error)) {
          await refreshUser();
        }
        if (get(data)) {
          set(logined, true);
          set(uuid, get(data).uuid);
          set(username, get(data).username);
          set(roles, get(data).roles);
          await requestProfiles();
          console.log(get(uuid), get(username), get(client_id));
          await ipcSetting.setTrackerUser({
            id: get(uuid),
            username: get(username),
            client_id: get(client_id),
          });
        }
      } else {
        await clearUser();
      }
    }

    async function refreshUser() {
      if (get(refresh_token)) {
        const { data, error } = await useFetch("/authentication/refresh", {
          headers: {
            "X-SCNexus-refresh-token": get(refresh_token),
          },
        })
          .post()
          .json();
        if (get(error)) {
          await clearUser();
        }
        if (get(data)) {
          set(access_token, get(data).access_token);
          set(refresh_token, get(data).refresh_token);
          await syncLoginStatus();
        }
      }
    }

    async function loginUser(access: string, refresh: string) {
      set(access_token, access);
      set(refresh_token, refresh);
      await syncLoginStatus();
    }

    async function logoutUser() {
      await clearUser();
    }

    async function initUser() {
      await syncLoginStatus();
    }

    async function requestUserSafeguard() {
      if (!get(logined)) return;
      const { data } = await useFetch("/user/safeguard/get").post().json();
      if (get(data)) {
        set(safeguard, {
          email_verified: get(data).email_verified,
          telnum_verified: get(data).telnum_verified,
        });
      }
    }

    async function setClientId(id: string) {
      set(client_id, id);
    }

    return {
      client_id,
      access_token,
      refresh_token,
      logined,
      uuid,
      username,
      roles,
      safeguard,
      profiles,
      initUser,
      loginUser,
      logoutUser,
      refreshUser,
      syncLoginStatus,
      requestUserSafeguard,
      setClientId,
    };
  },
  { persist: true }
);
