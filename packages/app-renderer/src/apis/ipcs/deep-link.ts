import { useIpcRendererOn } from './ipc-util'

export const apiDeepLinkOnAuthentication = useIpcRendererOn<{
  access_token: string | null
  refresh_token: string | null
}>(window.apiDeepLinkOnAuthentication)
