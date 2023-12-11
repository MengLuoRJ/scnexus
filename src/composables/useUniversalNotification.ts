import { useWebNotification } from "@vueuse/core";
import { useDiscreteApi } from "./useDiscreteApi";
import { type NotificationOptions } from "naive-ui";
import { useLocaleStore } from "@/stores/locale";

export function useUniversalNotification(
  options: NotificationOptions & {
    readonly title: string;
    readonly body: string;
  } & ({ renotify: true; tag: string } | { renotify?: false })
) {
  const { notification } = useDiscreteApi(["notification"]);
  const localeStore = useLocaleStore();
  const { isSupported, show, close, onClick, onClose } = useWebNotification({
    title: options.title,
    body: options.body,
    dir: "auto",
    lang: localeStore.getCurrent()?.key,
    renotify: options.renotify,
    tag: options.renotify ? options.tag : undefined,
  });
  if (isSupported) {
    show();
  }
  const ntf = notification.create({
    ...options,
    onClose: () => {
      options.onClose?.();
      ntf.destroy();
      close();
    },
  });
  onClick(() => {
    ntf.destroy();
    close();
  });
  onClose(() => {
    ntf.destroy();
    close();
  });
}
