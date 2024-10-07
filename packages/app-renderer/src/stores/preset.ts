import { ipcSetting } from "@/apis/ipcs/setting";
import { get } from "@vueuse/core";
import { defineStore } from "pinia";
import { ref } from "vue";

export const usePresetStore = defineStore("preset", () => {
  const campaign_display_mode = ref<"grid" | "list">("list");
  const play_button_game_mode = ref<"client" | "executable">("client");

  const storeRefs = {
    campaign_display_mode,
    play_button_game_mode,
  };

  return {
    ...storeRefs,
    storeRefs,
  };
});

export const initPresetStore = async () => {
  type PKey = keyof typeof settingStore.storeRefs;
  type PValue = (typeof settingStore.storeRefs)[PKey];

  const settingStore = usePresetStore();
  const { data: presistedSetting } = await ipcSetting.getSetting();
  if (presistedSetting?.PRESETS) {
    const presistedPresets = JSON.parse(presistedSetting.PRESETS);
    Object.keys(presistedPresets).map((key) => {
      if (
        presistedPresets[key] &&
        Object.keys(settingStore.storeRefs).includes(key)
      ) {
        const pKey: PKey = key as PKey;
        const pValue: PValue = presistedPresets[key] as PValue;
        if (settingStore[pKey]) settingStore.$patch({ [pKey]: pValue });
      }
    });
  }

  settingStore.$subscribe((_mutation, state) => {
    const presets: { [key: string]: PValue } = {};
    for (const key in state) {
      const pKey: PKey = key as PKey;
      presets[pKey] = get(state[pKey]);
    }
    const presetsJSON = JSON.stringify(presets);
    ipcSetting.setSettingKey("PRESETS", presetsJSON);
  });
};
