import { ipcApi, useIpcApi } from './ipc-util'
import type { CampaignType, MetadataInformated } from 'scnexus-standard/metadata'
import type { CampaignStore } from '@scnexus/app-shared/stores/campaign.store'
import type { CampaignActiveStore } from '@scnexus/app-shared/stores/campaign-active.store'
import type { ResultUncompressCCM } from '@scnexus/app-shared/types/campaign.type'

export const apiCampaignUnzipCompressFileCCM = (path: string) =>
  useIpcApi<ResultUncompressCCM>(
    'apiCampaignUnzipCompressFileCCM',
    ipcApi['campaign:unzip-compress-file-ccm'](path),
  )
export const apiCampaignUnzipCompressFileSimulateCCM = (path: string) =>
  useIpcApi<ResultUncompressCCM>(
    'apiCampaignUnzipCompressFileSimulateCCM',
    ipcApi['campaign:unzip-compress-file-simulate-ccm'](path),
  )
export const apiCampaignUnzipCompressFile7zSimulateCCM = (path: string) =>
  useIpcApi<ResultUncompressCCM>(
    'apiCampaignUnzipCompressFile7zSimulateCCM',
    ipcApi['campaign:unzip-compress-file-7z-simulate-ccm'](path),
  )
export const apiCampaignGetCampaignLists = () =>
  useIpcApi<CampaignStore>('apiCampaignGetCampaignLists', ipcApi['campaign:get-campaign-lists']())
export const apiCampaignUpdateCampaignLists = () =>
  useIpcApi<CampaignStore>(
    'apiCampaignUpdateCampaignLists',
    ipcApi['campaign:update-campaign-lists'](),
  )
export const apiCampaignUninstallCampaignFiles = (infor: MetadataInformated) =>
  useIpcApi<void>(
    'apiCampaignUninstallCampaignFiles',
    ipcApi['campaign:uninstall-campaign-files'](infor),
  )
export const apiCampaignGetActivedCampaignList = () =>
  useIpcApi<CampaignActiveStore>(
    'apiCampaignGetActivedCampaignList',
    ipcApi['campaign:get-actived-campaign-list'](),
  )
export const apiCampaignGetActivedCampaignTyped = (type: CampaignType) =>
  useIpcApi<MetadataInformated>(
    'apiCampaignGetActivedCampaignTyped',
    ipcApi['campaign:get-actived-campaign-typed'](type),
  )
export const apiCampaignUpdateActivedCampaignSet = () =>
  useIpcApi<CampaignActiveStore>(
    'apiCampaignUpdateActivedCampaignSet',
    ipcApi['campaign:update-actived-campaign-set'](),
  )
export const apiCampaignActiveCampaign = (infor: MetadataInformated) =>
  useIpcApi<void>('apiCampaignActiveCampaign', ipcApi['campaign:active-campaign'](infor))
export const apiCampaignUnactiveCampaign = (infor: MetadataInformated) =>
  useIpcApi<void>('apiCampaignUnactiveCampaign', ipcApi['campaign:unactive-campaign'](infor))
export const apiCampaignRecoverCampaignType = (campaign: CampaignType) =>
  useIpcApi<void>('apiCampaignRecoverCampaignType', ipcApi['campaign:recover-campaign-type'](campaign))
