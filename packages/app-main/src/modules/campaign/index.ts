import { initCampaignIpc } from './campaign.ipc'
export * from './campaign'
export function initCampaignModule() {
  initCampaignIpc()
}
