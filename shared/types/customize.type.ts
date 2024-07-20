import {
  Metadata,
  MetadataInformated,
  MetadataStandard,
} from "scnexus-standard/metadata";
export type { CustomizeStore } from "@electron/main/stores/customize";

export type CompressFileTree = {
  cf_path: string;
  name: string;
  root: CompressFileTreeNode;
};

export type CompressFileTreeNode = {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
  isComponent?: boolean;
  children?: CompressFileTreeNode[];
};

export type CompressFileList = {
  cf_path: string;
  name: string;
  files: {
    name: string;
    path: string;
    type?: "SC2Map" | "SC2Mod" | string;
    folder?: "Root" | "Maps" | "Mods" | string;
    isComponent?: boolean;
  }[];
};

export type CompressFileInfo = {
  metadata?: MetadataStandard;
  ccm?: {
    metadata?: MetadataStandard;
    metadata_root?: string;
  };
  compress_info: {
    size: number;
    size_compressed: number;
    files_count: number;
    /**
     * Zip File Name Encoding format, only available for Zip format
     * @default `utf8`
     * @value  `utf8` | `gb18030` | `gb2312`
     */
    fn_encoding?: string;
  };
  entry_tree?: CompressFileTree;
  entry_list?: CompressFileList;
};

export type ResultUncompress = {
  metadata: MetadataStandard;
  cf_path: string;
  cf_info: CompressFileInfo;
};

export type ResultInstallCustomize = {
  infor: MetadataInformated;
};

export type ResultUninstallCustomize = {
  infor: MetadataInformated;
};

export type ResultUnzipFile = {
  metadata?: Metadata;
  file_count?: number;
  success: boolean;
  error?: string;
};
