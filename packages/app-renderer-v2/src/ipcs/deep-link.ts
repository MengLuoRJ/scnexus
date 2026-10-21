import { ipcDesktop, ipcSubscription } from './internal/ipc-common'
import type { DesktopApi } from '@scnexus/app-shared/types/desktop.type'

export const ipcDeepLinkOnAuthentication = (
  listener: Parameters<DesktopApi['deepLink']['onAuthentication']>[0],
) => ipcSubscription((callback) => ipcDesktop().deepLink.onAuthentication(callback), listener)
export const ipcDeepLinkOnWorkshop = (listener: (id: string) => void) =>
  ipcSubscription((callback) => ipcDesktop().deepLink.onWorkshop(callback), listener)
