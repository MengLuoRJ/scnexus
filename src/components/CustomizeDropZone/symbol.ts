import { InjectionKey, Ref } from "vue";
import { CompressFileInfo } from "@shared/types/customize.type";

export const KEY_FILEPATH: InjectionKey<Ref<string>> = Symbol(
  "CustomizeDropZone_FilePath"
);
export const KEY_CFI: InjectionKey<Ref<CompressFileInfo | undefined>> = Symbol(
  "CustomizeDropZone_CFI"
);
