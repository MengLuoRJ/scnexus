import { useIpcApi } from './ipc-util'
import type { CampaignType, MetadataInformated } from 'scnexus-standard/metadata'
import type { CampaignStore } from '@scnexus/app-shared/stores/campaign.store'
import type { CampaignActiveStore } from '@scnexus/app-shared/stores/campaign-active.store'
import type { ResultUncompressCCM } from '@scnexus/app-shared/types/campaign.type'

export const apiCampaignUnzipCompressFileCCM = (path: string) =>
    useIpcApi<ResultUncompressCCM>(
      'apiCampaignUnzipCompressFileCCM',
      window.apiCampaignUnzipCompressFileCCM(path),
    )
export const apiCampaignUnzipCompressFileSimulateCCM = (path: string) =>
    useIpcApi<ResultUncompressCCM>(
      'apiCampaignUnzipCompressFileSimulateCCM',
      window.apiCampaignUnzipCompressFileSimulateCCM(path),
    )
export const apiCampaignUnzipCompressFile7zSimulateCCM = (path: string) =>
    useIpcApi<ResultUncompressCCM>(
      'apiCampaignUnzipCompressFile7zSimulateCCM',
      window.apiCampaignUnzipCompressFile7zSimulateCCM(path),
    )
export const apiCampaignGetCampaignLists = () =>
    useIpcApi<CampaignStore>('apiCampaignGetCampaignLists', window.apiCampaignGetCampaignLists()),
export const apiCampaignUpdateCampaignLists = () =>
    useIpcApi<CampaignStore>(
      'apiCampaignUpdateCampaignLists',
      window.apiCampaignUpdateCampaignLists(),
    )
export const apiCampaignUninstallCampaignFiles = (infor: MetadataInformated) =>
    useIpcApi<void>(
      'apiCampaignUninstallCampaignFiles',
      window.apiCampaignUninstallCampaignFiles(infor),
    )
export const apiCampaignGetActivedCampaignList = () =>
    useIpcApi<CampaignActiveStore>(
      'apiCampaignGetActivedCampaignList',
      window.apiCampaignGetActivedCampaignList(),
    )
export const apiCampaignGetActivedCampaignTyped = (type: CampaignType) =>
    useIpcApi<MetadataInformated>(
      'apiCampaignGetActivedCampaignTyped',
      window.apiCampaignGetActivedCampaignTyped(type),
    )
export const apiCampaignUpdateActivedCampaignSet = () =>
    useIpcApi<CampaignActiveStore>(
      'apiCampaignUpdateActivedCampaignSet',
      window.apiCampaignUpdateActivedCampaignSet(),
    )
export const apiCampaignActiveCampaign = (infor: MetadataInformated) =>
  useIpcApi<void>('apiCampaignActiveCampaign', window.apiCampaignActiveCampaign(infor))
export const apiCampaignUnactiveCampaign = (infor: MetadataInformated) =>
  useIpcApi<void>('apiCampaignUnactiveCampaign', window.apiCampaignUnactiveCampaign(infor))
export const apiCampaignRecoverCampaignType = (campaign: CampaignType) =>
    useIpcApi<void>(
      'apiCampaignRecoverCampaignType',
      window.apiCampaignRecoverCampaignType(campaign),
    )
