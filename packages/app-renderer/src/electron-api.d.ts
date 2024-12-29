export {}

declare global {
  type IpcApiResult<T = unknown> = { data?: T; error?: string }
  type IpcApiRequest<T = unknown> = Promise<IpcApiResult<T>>
  type IpcApiListener = (event: object, ...args: any[]) => void
  type IpcApiSubscribe = (listener: IpcApiListener) => () => void

  interface Window {
    apiAppGetVersion: () => IpcApiRequest
    apiAppIsPackaged: () => IpcApiRequest
    apiAppGetLocale: () => IpcApiRequest
    apiAppGetSystemLocale: () => IpcApiRequest
    apiAppGetLocaleCountryCode: () => IpcApiRequest
    apiAppGetPreferredSystemLanguages: () => IpcApiRequest
    apiAppGetPath: (name: string) => IpcApiRequest
    apiAppGetPaths: () => IpcApiRequest
    apiCampaignUnzipCompressFileCCM: (path: string) => IpcApiRequest
    apiCampaignUnzipCompressFileSimulateCCM: (path: string) => IpcApiRequest
    apiCampaignUnzipCompressFile7zSimulateCCM: (path: string) => IpcApiRequest
    apiCampaignGetCampaignLists: () => IpcApiRequest
    apiCampaignUpdateCampaignLists: () => IpcApiRequest
    apiCampaignUninstallCampaignFiles: (info: unknown) => IpcApiRequest
    apiCampaignGetActivedCampaignList: () => IpcApiRequest
    apiCampaignGetActivedCampaignTyped: (type: string) => IpcApiRequest
    apiCampaignUpdateActivedCampaignSet: () => IpcApiRequest
    apiCampaignActiveCampaign: (info: unknown) => IpcApiRequest
    apiCampaignUnactiveCampaign: (info: unknown) => IpcApiRequest
    apiCampaignRecoverCampaignType: (type: string) => IpcApiRequest
    apiCustomizeReadCompressFileInfo: (path: string) => IpcApiRequest
    apiCustomizeInstallCompressFile: (path: string) => IpcApiRequest
    apiCustomizeValidateCompressFile: (path: string) => IpcApiRequest
    apiCustomizeReadCompressFileInfo7z: (path: string) => IpcApiRequest
    apiCustomizeInstallCompressFile7z: (path: string) => IpcApiRequest
    apiCustomizeInstallCustomize: (info: unknown) => IpcApiRequest
    apiCustomizeUninstallCustomize: (info: unknown) => IpcApiRequest
    apiCustomizeGetInstalledCustomizeList: () => IpcApiRequest
    apiCustomizeScanInstalledCustomizeList: () => IpcApiRequest
    apiCustomizeRunGameClient: (path?: string) => IpcApiRequest
    apiCustomizeRunGameExecutable: (parameters?: unknown) => IpcApiRequest
    apiCustomizeRunEditorExecutable: (path?: string) => IpcApiRequest
    apiDeepLinkOnAuthentication: IpcApiSubscribe
    apiDialogShowOpenDialogSync: (options: unknown) => IpcApiRequest
    apiDialogShowOpenDialog: (options: unknown) => IpcApiRequest
    apiProfileGetProfile: () => IpcApiRequest
    apiProfileGetProfileKey: (key: string) => IpcApiRequest
    apiProfileSetProfileKey: (key: string, value: unknown) => IpcApiRequest
    apiProfileInitGameService: (path?: string) => IpcApiRequest
    apiSettingGetSetting: () => IpcApiRequest
    apiSettingGetSettingKey: (key: string) => IpcApiRequest
    apiSettingSetSettingKey: (key: string, value: unknown) => IpcApiRequest
    apiSettingSetTrackerUser: (user: unknown) => IpcApiRequest
    apiShellOpenExternalWebsite: (link: string) => IpcApiRequest
    apiShellOpenPath: (path: string) => IpcApiRequest
    apiShellShowItemInFolder: (path: string) => IpcApiRequest
    apiUpdaterCheckForUpdatesAndNotify: () => IpcApiRequest
    apiUpdaterCheckForUpdates: () => IpcApiRequest
    apiUpdaterDownloadUpdate: () => IpcApiRequest
    apiUpdaterQuitAndInstall: () => IpcApiRequest
    apiUpdaterOnCheckingForUpdate: IpcApiSubscribe
    apiUpdaterOnUpdateAvailable: IpcApiSubscribe
    apiUpdaterOnUpdateNotAvailable: IpcApiSubscribe
    apiUpdaterOnDownloadProgress: IpcApiSubscribe
    apiUpdaterOnUpdateDownloaded: IpcApiSubscribe
    apiUpdaterOnError: IpcApiSubscribe
    apiWorkshopGetFileMd5: (path: string) => IpcApiRequest
    apiWorkshopGetFileMd5Wasm: (path: string) => IpcApiRequest
    apiWorkshopWriteMetadata: (path: string, metadata: Record<string, unknown>) => IpcApiRequest
    apiWorkshopUploadCompressedFile: (filePath: string, targetUrl: string, fileMd5: string) => IpcApiRequest
    webUtils: import('electron').WebUtils
  }
}