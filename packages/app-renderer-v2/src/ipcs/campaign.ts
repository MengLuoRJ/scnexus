import { ipcDesktop, ipcRequest, ipcSnapshot, ipcSubscription } from './internal/ipc-common'
import type {
  SourceInput,
  InstallSelection,
  InstallProgress,
  RemovalDecision,
  ConflictDecision,
} from '@scnexus/app-shared/types/content.type'

export const ipcCampaignOnInstallProgress = (listener: (progress: InstallProgress) => void) =>
  ipcSubscription((handler) => ipcDesktop().campaign.onInstallProgress(handler), listener)

export const ipcCampaignCancel = (id: string) => ipcRequest(() => ipcDesktop().campaign.cancel(id))
export const ipcCampaignAnalyze = (input: SourceInput) =>
  ipcRequest(() => ipcDesktop().campaign.analyze(ipcSnapshot(input)))
export const ipcCampaignInstall = (selection: InstallSelection) =>
  ipcRequest(() => ipcDesktop().campaign.install(ipcSnapshot(selection)))
export const ipcCampaignList = () => ipcRequest(() => ipcDesktop().campaign.list())
export const ipcCampaignScan = () => ipcRequest(() => ipcDesktop().campaign.scan())
export const ipcCampaignPrepareUninstall = (id: string) =>
  ipcRequest(() => ipcDesktop().campaign.prepareUninstall(id))
export const ipcCampaignUninstall = (id: string, decisions: RemovalDecision[]) =>
  ipcRequest(() => ipcDesktop().campaign.uninstall(id, ipcSnapshot(decisions)))
export const ipcCampaignPrepareActivation = (id: string) =>
  ipcRequest(() => ipcDesktop().campaign.prepareActivation(id))
export const ipcCampaignActivate = (id: string, decisions: ConflictDecision[]) =>
  ipcRequest(() => ipcDesktop().campaign.activate(id, ipcSnapshot(decisions)))
export const ipcCampaignActive = () => ipcRequest(() => ipcDesktop().campaign.active())
export const ipcCampaignPrepareDeactivation = (id: string) =>
  ipcRequest(() => ipcDesktop().campaign.prepareDeactivation(id))
export const ipcCampaignDeactivate = (id: string, decisions: RemovalDecision[]) =>
  ipcRequest(() => ipcDesktop().campaign.deactivate(id, ipcSnapshot(decisions)))

export const ipcCampaignLaunch = () => ipcRequest(() => ipcDesktop().campaign.launch())
