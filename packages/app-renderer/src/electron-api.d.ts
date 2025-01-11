export {}

declare global {
  type IpcApiResult<T = unknown> = { data?: T; error?: string }
  type IpcApiRequest<T = unknown> = Promise<IpcApiResult<T>>
  type IpcApiListener = (event: object, ...args: any[]) => void
  type IpcApiSubscribe = (listener: IpcApiListener) => () => void

  interface IpcApi {
    'app:get-version': () => IpcApiRequest
    'app:is-packaged': () => IpcApiRequest
    'app:get-locale': () => IpcApiRequest
    'app:get-system-locale': () => IpcApiRequest
    'app:get-locale-country-code': () => IpcApiRequest
    'app:get-preferred-system-languages': () => IpcApiRequest
    'app:get-path': (name: string) => IpcApiRequest
    'app:get-paths': () => IpcApiRequest
    'campaign:unzip-compress-file-ccm': (path: string) => IpcApiRequest
    'campaign:unzip-compress-file-simulate-ccm': (path: string) => IpcApiRequest
    'campaign:unzip-compress-file-7z-simulate-ccm': (path: string) => IpcApiRequest
    'campaign:get-campaign-lists': () => IpcApiRequest
    'campaign:update-campaign-lists': () => IpcApiRequest
    'campaign:uninstall-campaign-files': (info: unknown) => IpcApiRequest
    'campaign:get-actived-campaign-list': () => IpcApiRequest
    'campaign:get-actived-campaign-typed': (type: string) => IpcApiRequest
    'campaign:update-actived-campaign-set': () => IpcApiRequest
    'campaign:active-campaign': (info: unknown) => IpcApiRequest
    'campaign:unactive-campaign': (info: unknown) => IpcApiRequest
    'campaign:recover-campaign-type': (type: string) => IpcApiRequest
    'customize:read-compress-file-info': (path: string) => IpcApiRequest
    'customize:install-compress-file': (path: string) => IpcApiRequest
    'customize:validate-compress-file': (path: string) => IpcApiRequest
    'customize:read-compress-file-info-7z': (path: string) => IpcApiRequest
    'customize:install-compress-file-7z': (path: string) => IpcApiRequest
    'customize:install-customize': (info: unknown) => IpcApiRequest
    'customize:uninstall-customize': (info: unknown) => IpcApiRequest
    'customize:get-installed-customize-list': () => IpcApiRequest
    'customize:scan-installed-customize-list': () => IpcApiRequest
    'customize:run-game-client': (path?: string) => IpcApiRequest
    'customize:run-game-executable': (parameters?: unknown) => IpcApiRequest
    'customize:run-editor-executable': (path?: string) => IpcApiRequest
    'deeplink:authentication': IpcApiSubscribe
    'dialog:show-open-dialog-sync': (options: unknown) => IpcApiRequest
    'dialog:show-open-dialog': (options: unknown) => IpcApiRequest
    'profile:get-profile': () => IpcApiRequest
    'profile:get-profile-key': (key: string) => IpcApiRequest
    'profile:set-profile-key': (key: string, value: unknown) => IpcApiRequest
    'profile:init-game-service': (path?: string) => IpcApiRequest
    'setting:get-setting': () => IpcApiRequest
    'setting:get-setting-key': (key: string) => IpcApiRequest
    'setting:set-setting-key': (key: string, value: unknown) => IpcApiRequest
    'setting:set-tracker-user': (user: unknown) => IpcApiRequest
    'shell:open-external-website': (link: string) => IpcApiRequest
    'shell:open-path': (path: string) => IpcApiRequest
    'shell:show-item-in-folder': (path: string) => IpcApiRequest
    'updater:check-for-updates-and-notify': () => IpcApiRequest
    'updater:check-for-updates': () => IpcApiRequest
    'updater:download-update': () => IpcApiRequest
    'updater:quit-and-install': () => IpcApiRequest
    'updater:checking-for-update': IpcApiSubscribe
    'updater:update-available': IpcApiSubscribe
    'updater:update-not-available': IpcApiSubscribe
    'updater:download-progress': IpcApiSubscribe
    'updater:update-downloaded': IpcApiSubscribe
    'updater:error': IpcApiSubscribe
    'workshop:get-file-md5': (path: string) => IpcApiRequest
    'workshop:get-file-md5-wasm': (path: string) => IpcApiRequest
    'workshop:write-metadata': (path: string, metadata: Record<string, unknown>) => IpcApiRequest
    'workshop:upload-compressed-file': (
      filePath: string,
      targetUrl: string,
      fileMd5: string,
    ) => IpcApiRequest
  }

  interface Window {
    webUtils: import('electron').WebUtils
  }
}
