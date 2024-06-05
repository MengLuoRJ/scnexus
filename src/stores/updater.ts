import { ProgressInfo, UpdateInfo } from "electron-updater";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useUpdaterStore = defineStore("updater", () => {
  const INITIALIZED = ref<boolean>(false);

  const CURRENT_VERSION = ref<string>("");

  const UPDATE_CHECKING = ref<boolean>(false);
  const UPDATE_AVAILABLE = ref<boolean>(false);
  const UPDATE_DOWNLOADING = ref<boolean>(false);
  const UPDATE_DOWNLOADED = ref<boolean>(false);

  const updateInfo = ref<UpdateInfo>();

  const downloadProgress = ref<ProgressInfo>({
    percent: 0,
    delta: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
  });

  function clear() {
    UPDATE_CHECKING.value = false;
    UPDATE_AVAILABLE.value = false;
    UPDATE_DOWNLOADING.value = false;
    UPDATE_DOWNLOADED.value = false;
    updateInfo.value = undefined;
    downloadProgress.value = {
      percent: 0,
      delta: 0,
      transferred: 0,
      total: 0,
      bytesPerSecond: 0,
    };
  }

  return {
    INITIALIZED,
    CURRENT_VERSION,
    UPDATE_CHECKING,
    UPDATE_AVAILABLE,
    UPDATE_DOWNLOADING,
    UPDATE_DOWNLOADED,
    updateInfo,
    downloadProgress,
    clear,
  };
});
