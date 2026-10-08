import { bridgeRequest } from "./internal/bridge";
export type OpenDialogOptions = {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: (
    | "openFile"
    | "openDirectory"
    | "multiSelections"
    | "showHiddenFiles"
    | "createDirectory"
    | "promptToCreate"
    | "noResolveAliases"
    | "treatPackageAsDirectory"
    | "dontAddToRecent"
  )[];
  message?: string;
  securityScopedBookmarks?: boolean;
};
export const apiDialogShowOpenDialog = (options: OpenDialogOptions) =>
  bridgeRequest<{ canceled: boolean; filePaths: string[]; bookmarks?: string[] }>(
    "dialog:show-open-dialog",
    options,
  );
export const apiDialogShowOpenDialogSync = (options: OpenDialogOptions) =>
  bridgeRequest<string[] | undefined>("dialog:show-open-dialog-sync", options);
