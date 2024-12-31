import { useIpcRendererOn } from './ipc-util'

export const ipcDeepLink = {
  onAuthentication: useIpcRendererOn<{
    access_token: string | null
    refresh_token: string | null
  }>(window.apiDeepLinkOnAuthentication),
}
