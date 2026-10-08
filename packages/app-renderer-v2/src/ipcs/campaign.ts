import { desktop, request } from "./internal/ipc-common";
import type {
  SourceInput,
  InstallSelection,
  RemovalDecision,
  ConflictDecision,
} from "@scnexus/app-shared/types/content.type";

export const apiCampaignCancel = (id: string) => request(() => desktop().campaign.cancel(id));
export const apiCampaignAnalyze = (input: SourceInput) =>
  request(() => desktop().campaign.analyze(input));
export const apiCampaignInstall = (selection: InstallSelection) =>
  request(() => desktop().campaign.install(selection));
export const apiCampaignList = () => request(() => desktop().campaign.list());
export const apiCampaignScan = () => request(() => desktop().campaign.scan());
export const apiCampaignPrepareUninstall = (id: string) =>
  request(() => desktop().campaign.prepareUninstall(id));
export const apiCampaignUninstall = (id: string, decisions: RemovalDecision[]) =>
  request(() => desktop().campaign.uninstall(id, decisions));
export const apiCampaignPrepareActivation = (id: string) =>
  request(() => desktop().campaign.prepareActivation(id));
export const apiCampaignActivate = (id: string, decisions: ConflictDecision[]) =>
  request(() => desktop().campaign.activate(id, decisions));
export const apiCampaignActive = () => request(() => desktop().campaign.active());
export const apiCampaignPrepareDeactivation = (id: string) =>
  request(() => desktop().campaign.prepareDeactivation(id));
export const apiCampaignDeactivate = (id: string, decisions: RemovalDecision[]) =>
  request(() => desktop().campaign.deactivate(id, decisions));
