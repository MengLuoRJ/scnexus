import { useWebNotification } from "@vueuse/core";
import { useDiscreteApi } from "./useDiscreteApi";
import { type NotificationOptions } from "naive-ui";
import { useLocaleStore } from "@/stores/locale";

export function useNotification(
  options: NotificationOptions & { readonly title: string }
) {
  const { notification } = useDiscreteApi(["notification"]);
  const localeStore = useLocaleStore();
  const { isSupported, show, close, onClick, onClose } = useWebNotification({
    title: options.title,
    dir: "auto",
    lang: localeStore.getCurrent()?.key,
    renotify: true,
    // tag: "test",
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
