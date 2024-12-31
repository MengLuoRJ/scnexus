import * as api from "@scnexus/app-shared/ipc/shell";
import { exposeInvoke } from "./common.js";

exposeInvoke("apiShellOpenExternalWebsite", api.apiShellOpenExternalWebsite);
exposeInvoke("apiShellOpenPath", api.apiShellOpenPath);
exposeInvoke("apiShellShowItemInFolder", api.apiShellShowItemInFolder);
