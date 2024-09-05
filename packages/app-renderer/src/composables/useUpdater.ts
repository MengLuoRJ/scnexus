import { useUpdaterStore } from "@/stores/updater";
import { useIntervalFn, useWebNotification } from "@vueuse/core";
import { h } from "vue";
import { NButton } from "naive-ui";
import { useDiscreteApi } from "./useDiscreteApi";
import { ipcApp } from "@/apis/ipcs/app";
import { ipcUpdater } from "@/apis/ipcs/updater";

export async function initUpdater() {
  const updaterStore = useUpdaterStore();
  if (updaterStore.INITIALIZED) {
    return;
  }

  updaterStore.INITIALIZED = true;

  const { data: ver } = await ipcApp.getVersion();
  if (!ver) return;
  updaterStore.CURRENT_VERSION = "v" + ver;

  const { data: packaged } = await ipcApp.isPackaged();
  if (!packaged) {
    return;
  }

  ipcUpdater.onError((_, error) => {
    console.error(error);
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
  const updaterStore = useUpdaterStore();
  if (updaterStore.UPDATE_DOWNLOADING || updaterStore.UPDATE_DOWNLOADED) return;

  await checkUpdates();
}

export async function checkUpdates() {
  const updaterStore = useUpdaterStore();
  ipcUpdater.onCheckingForUpdate(() => {
    updaterStore.UPDATE_CHECKING = true;
    updaterStore.UPDATE_AVAILABLE = false;
  });

  ipcUpdater.onUpdateNotAvailable(() => {
    updaterStore.UPDATE_CHECKING = false;
    updaterStore.UPDATE_AVAILABLE = false;
  });

  ipcUpdater.onUpdateAvailable((_, info) => {
    updaterStore.UPDATE_CHECKING = false;
    updaterStore.UPDATE_AVAILABLE = true;
    updaterStore.updateInfo = info;

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
      meta: `v${updaterStore.updateInfo.version} @ ${new Date(
        updaterStore.updateInfo.releaseDate
      ).toLocaleDateString()}`,
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

  await ipcUpdater.checkForUpdates();
}

export async function downloadUpdates() {
  const updaterStore = useUpdaterStore();
  updaterStore.UPDATE_DOWNLOADING = true;

  const { notification } = useDiscreteApi(["notification"]);

  const ntf_downloading = notification.info({
    title: `更新版本「v${updaterStore.updateInfo?.version}」`,
    content: `"正在初始化更新过程……"`,
    closable: false,
  });

  ipcUpdater.onDownloadProgress((_, progress) => {
    updaterStore.downloadProgress = progress;

    ntf_downloading.content =
      "正在下载：" +
      `${updaterStore.downloadProgress.percent.toFixed(2)}% ` +
      `(${(updaterStore.downloadProgress.bytesPerSecond / 1024).toFixed(
        2
      )}KB/s)`;
  });

  ipcUpdater.onUpdateDownloaded(() => {
    updaterStore.UPDATE_DOWNLOADING = false;
    updaterStore.UPDATE_DOWNLOADED = true;

    ntf_downloading.destroy();

    const ntf_downloaded = notification.info({
      title: "「星际枢纽」更新已就绪",
      content: `新版本「v${updaterStore.updateInfo?.version}」已下载完成，点击安装更新立即重启应用完成更新，或在关闭应用时自动安装更新。`,
      meta: `v${updaterStore.updateInfo?.releaseDate}`,
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

  await ipcUpdater.downloadUpdate();
}

export async function installUpdates() {
  await ipcUpdater.quitAndInstall();
}
