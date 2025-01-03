import * as api from "@scnexus/app-shared/ipc/dialog";
import { exposeApis, invoke } from "./common.js";

export const apiDialogShowOpenDialogSync = (options: unknown) => api.apiDialogShowOpenDialogSync(invoke, options);
export const apiDialogShowOpenDialog = (options: unknown) => api.apiDialogShowOpenDialog(invoke, options);

exposeApis({ apiDialogShowOpenDialogSync, apiDialogShowOpenDialog });
