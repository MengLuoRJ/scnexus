import { useIpcApi } from './ipc-util'
import type { CampaignType, MetadataInformated } from 'scnexus-standard/metadata'
import type { CampaignStore } from '@scnexus/app-shared/stores/campaign.store'
import type { CampaignActiveStore } from '@scnexus/app-shared/stores/campaign-active.store'
import type { ResultUncompressCCM } from '@scnexus/app-shared/types/campaign.type'

export const ipcCampaign = {
  unzipCompressFileCCM: (path: string) =>
    useIpcApi<ResultUncompressCCM>(
      'apiCampaignUnzipCompressFileCCM',
      window.apiCampaignUnzipCompressFileCCM(path),
    ),
  unzipCompressFileSimulateCCM: (path: string) =>
    useIpcApi<ResultUncompressCCM>(
      'apiCampaignUnzipCompressFileSimulateCCM',
      window.apiCampaignUnzipCompressFileSimulateCCM(path),
    ),
  unzipCompressFile7zSimulateCCM: (path: string) =>
    useIpcApi<ResultUncompressCCM>(
      'apiCampaignUnzipCompressFile7zSimulateCCM',
      window.apiCampaignUnzipCompressFile7zSimulateCCM(path),
    ),

  getCampaignLists: () =>
    useIpcApi<CampaignStore>('apiCampaignGetCampaignLists', window.apiCampaignGetCampaignLists()),
  updateCampaignLists: () =>
    useIpcApi<CampaignStore>(
      'apiCampaignUpdateCampaignLists',
      window.apiCampaignUpdateCampaignLists(),
    ),
  uninstallCampiagnFiles: (infor: MetadataInformated) =>
    useIpcApi<void>(
      'apiCampaignUninstallCampaignFiles',
      window.apiCampaignUninstallCampaignFiles(infor),
    ),

  getActivedCampaignList: () =>
    useIpcApi<CampaignActiveStore>(
      'apiCampaignGetActivedCampaignList',
      window.apiCampaignGetActivedCampaignList(),
    ),
  getActivedCampaignTyped: (type: CampaignType) =>
    useIpcApi<MetadataInformated>(
      'apiCampaignGetActivedCampaignTyped',
      window.apiCampaignGetActivedCampaignTyped(type),
    ),
  updateActivedCampaignSet: () =>
    useIpcApi<CampaignActiveStore>(
      'apiCampaignUpdateActivedCampaignSet',
      window.apiCampaignUpdateActivedCampaignSet(),
    ),

  activeCampaign: (infor: MetadataInformated) =>
    useIpcApi<void>('apiCampaignActiveCampaign', window.apiCampaignActiveCampaign(infor)),
  unactiveCampaign: (infor: MetadataInformated) =>
    useIpcApi<void>('apiCampaignUnactiveCampaign', window.apiCampaignUnactiveCampaign(infor)),
  recoverCampaignType: (campaign: CampaignType) =>
    useIpcApi<void>(
      'apiCampaignRecoverCampaignType',
      window.apiCampaignRecoverCampaignType(campaign),
    ),
}
