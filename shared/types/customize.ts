import { Metadata } from "@shared/types";
export type { CustomizeStore } from "@electron/main/stores/customize";
export type { CustomizeActiveStore } from "@electron/main/stores/customize-active";

export type CompressFileInfo = {
  metadata: Metadata;
  compress_info: {
    size: number;
    compressed_size: number;
    file_count: number;
    /**
     * Zip File Name Encoding format, only available for Zip format
     * @default `utf8`
     * @value  `utf8` | `gb18030` | `gb2312`
     */
    fn_encoding?: string;
  };
  tolerance?: boolean;
  metadata_root?: string;
};

export type ResultUnzipFile = {
  metadata?: Metadata;
  file_count?: number;
  success: boolean;
  error?: string;
};

export type ResultUncompress = {
  metadata?: Metadata;
  info?: {
    file_path: string;
    uncompress_path: string;
  };
  success: boolean;
  error?: string;
};

export const METADATA_NOT_FOUND = "METADATA_NOT_FOUND";
