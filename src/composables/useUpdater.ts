import { useUpdaterStore } from "@/stores/updater";
import { useIntervalFn, useWebNotification } from "@vueuse/core";
import { useUniversalNotification } from "./useUniversalNotification";
import { h } from "vue";
import { NButton } from "naive-ui";
import { isPackaged } from "./useIpcHost/useAppIpc";
import { useDiscreteApi } from "./useDiscreteApi";

const updaterStore = useUpdaterStore();

export async function initUpdater() {
  if (updaterStore.INITIALIZED) {
    return;
  }

  updaterStore.INITIALIZED = true;

  const ver = await window.ipcRenderer.invoke("app::get-version");
  updaterStore.CURRENT_VERSION = "v" + ver;

  const packaged = await isPackaged();
  if (!packaged) {
    return;
  }

  window.ipcRenderer.updater.clearError();
  window.ipcRenderer.updater.onError((_, error) => {
    console.error(error);
    // updaterStore.clear();
  });

  const { pause, resume, isActive } = useIntervalFn(
    () => {
      pause();
      cronCheckUpdates();
      resume();
    },
    1000 * 60 * 60 * 1,
    {
      immediate: true,
    }
  );
  cronCheckUpdates();
}

async function cronCheckUpdates() {
  if (updaterStore.UPDATE_DOWNLOADING || updaterStore.UPDATE_DOWNLOADED) return;

  await checkUpdates();
}

export async function checkUpdates() {
  window.ipcRenderer.updater.onCheckingForUpdate(() => {
    updaterStore.UPDATE_CHECKING = true;
    updaterStore.UPDATE_AVAILABLE = false;
  });
  window.ipcRenderer.updater.onUpdateNotAvailable(() => {
    updaterStore.UPDATE_CHECKING = false;
    updaterStore.UPDATE_AVAILABLE = false;
    window.ipcRenderer.updater.clearCheck();
  });
  window.ipcRenderer.updater.onUpdateAvailable((_, info) => {
    updaterStore.UPDATE_CHECKING = false;
    updaterStore.UPDATE_AVAILABLE = true;
    updaterStore.updateInfo = info;
    window.ipcRenderer.updater.clearCheck();

    const { isSupported, show, close } = useWebNotification({
      title: "「星际枢纽」版本更新",
      body: `新版本「v${updaterStore.updateInfo.version}」现已可用`,
      dir: "auto",
      renotify: true,
      tag: "updater",
    });
    if (isSupported) {
      show();
    }

    const { notification } = useDiscreteApi(["notification"]);

    const ntf = notification.info({
      title: "「星际枢纽」版本更新",
      content: `新版本「v${updaterStore.updateInfo.version}」现已可用`,
      meta: `v${updaterStore.updateInfo.releaseDate}`,
      action: () =>
        h(
          NButton,
          {
            text: true,
            type: "primary",
            onClick: () => {
              downloadUpdates();
              close();
              ntf.destroy();
            },
          },
          { default: () => "更新" }
        ),
    });
  });

  await window.ipcRenderer.invoke("updater::check-for-updates");
}

export async function downloadUpdates() {
  updaterStore.UPDATE_DOWNLOADING = true;

  const { notification } = useDiscreteApi(["notification"]);

  const ntf_downloading = notification.info({
    title: `更新版本「v${updaterStore.updateInfo.version}」`,
    content: `"正在初始化更新过程……"`,
    closable: false,
  });

  window.ipcRenderer.updater.onDownloadProgress((_, progress) => {
    updaterStore.downloadProgress = progress;

    ntf_downloading.content =
      "正在下载：" +
      `${updaterStore.downloadProgress.percent.toFixed(2)}%` +
      `(${(updaterStore.downloadProgress.bytesPerSecond / 1024).toFixed(
        2
      )}KB/s)`;
  });
  window.ipcRenderer.updater.onUpdateDownloaded(() => {
    updaterStore.UPDATE_DOWNLOADING = false;
    updaterStore.UPDATE_DOWNLOADED = true;
    window.ipcRenderer.updater.clearDownload();

    ntf_downloading.destroy();

    const ntf_downloaded = notification.info({
      title: "「星际枢纽」更新已就绪",
      content: `新版本「v${updaterStore.updateInfo.version}」已下载完成，点击安装更新立即重启应用完成更新，或在关闭应用时自动安装更新。`,
      meta: `v${updaterStore.updateInfo.releaseDate}`,
      action: () =>
        h(
          NButton,
          {
            text: true,
            type: "primary",
            onClick: () => {
              installUpdates();
              ntf_downloaded.destroy();
            },
          },
          { default: () => "安装" }
        ),
    });
  });
  await window.ipcRenderer.invoke("updater::download-update");
}

export async function installUpdates() {
  window.ipcRenderer.updater.clearAll();
  await window.ipcRenderer.invoke("updater::quit-and-install");
}
