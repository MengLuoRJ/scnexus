import * as api from "@scnexus/app-shared/ipc/workshop";
import { exposeInvoke } from "./common.js";

exposeInvoke("apiWorkshopGetFileMd5", api.apiWorkshopGetFileMd5);
exposeInvoke("apiWorkshopGetFileMd5Wasm", api.apiWorkshopGetFileMd5Wasm);
exposeInvoke("apiWorkshopWriteMetadata", api.apiWorkshopWriteMetadata);
exposeInvoke("apiWorkshopUploadCompressedFile", api.apiWorkshopUploadCompressedFile);