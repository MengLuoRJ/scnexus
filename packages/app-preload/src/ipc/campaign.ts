import { exposeApis, invoke } from '../ipc-common.js'

export const apiCampaignUnzipCompressFileCCM = (path: string) =>
  invoke('campaign:unzip-compress-file-ccm', path)
export const apiCampaignUnzipCompressFileSimulateCCM = (path: string) =>
  invoke('campaign:unzip-compress-file-simulate-ccm', path)
export const apiCampaignUnzipCompressFile7zSimulateCCM = (path: string) =>
  invoke('campaign:unzip-compress-file-7z-simulate-ccm', path)
export const apiCampaignGetCampaignLists = () => invoke('campaign:get-campaign-lists')
export const apiCampaignUpdateCampaignLists = () => invoke('campaign:update-campaign-lists')
export const apiCampaignUninstallCampaignFiles = (info: unknown) =>
  invoke('campaign:uninstall-campaign-files', info)
export const apiCampaignGetActivedCampaignList = () => invoke('campaign:get-actived-campaign-list')
export const apiCampaignGetActivedCampaignTyped = (type: string) =>
  invoke('campaign:get-actived-campaign-typed', type)
export const apiCampaignUpdateActivedCampaignSet = () =>
  invoke('campaign:update-actived-campaign-set')
export const apiCampaignActiveCampaign = (info: unknown) => invoke('campaign:active-campaign', info)
export const apiCampaignUnactiveCampaign = (info: unknown) =>
  invoke('campaign:unactive-campaign', info)
export const apiCampaignRecoverCampaignType = (type: string) =>
  invoke('campaign:recover-campaign-type', type)

exposeApis({
  'campaign:unzip-compress-file-ccm': apiCampaignUnzipCompressFileCCM,
  'campaign:unzip-compress-file-simulate-ccm': apiCampaignUnzipCompressFileSimulateCCM,
  'campaign:unzip-compress-file-7z-simulate-ccm': apiCampaignUnzipCompressFile7zSimulateCCM,
  'campaign:get-campaign-lists': apiCampaignGetCampaignLists,
  'campaign:update-campaign-lists': apiCampaignUpdateCampaignLists,
  'campaign:uninstall-campaign-files': apiCampaignUninstallCampaignFiles,
  'campaign:get-actived-campaign-list': apiCampaignGetActivedCampaignList,
  'campaign:get-actived-campaign-typed': apiCampaignGetActivedCampaignTyped,
  'campaign:update-actived-campaign-set': apiCampaignUpdateActivedCampaignSet,
  'campaign:active-campaign': apiCampaignActiveCampaign,
  'campaign:unactive-campaign': apiCampaignUnactiveCampaign,
  'campaign:recover-campaign-type': apiCampaignRecoverCampaignType,
})
