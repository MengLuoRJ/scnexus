import * as api from "@scnexus/app-shared/ipc/dialog";
import { exposeInvoke } from "./common.js";

exposeInvoke("apiDialogShowOpenDialogSync", api.apiDialogShowOpenDialogSync);
exposeInvoke("apiDialogShowOpenDialog", api.apiDialogShowOpenDialog);