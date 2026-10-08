import { desktop, request } from "./internal/ipc-common";
import type {
  SourceInput,
  InstallSelection,
  RemovalDecision,
} from "@scnexus/app-shared/types/content.type";

export const apiCustomizeCancel = (id: string) => request(() => desktop().customize.cancel(id));
export const apiCustomizeAnalyze = (input: SourceInput) =>
  request(() => desktop().customize.analyze(input));
export const apiCustomizeInstall = (selection: InstallSelection) =>
  request(() => desktop().customize.install(selection));
export const apiCustomizeList = () => request(() => desktop().customize.list());
export const apiCustomizeScan = () => request(() => desktop().customize.scan());
export const apiCustomizePrepareUninstall = (id: string) =>
  request(() => desktop().customize.prepareUninstall(id));
export const apiCustomizeUninstall = (id: string, decisions: RemovalDecision[]) =>
  request(() => desktop().customize.uninstall(id, decisions));
