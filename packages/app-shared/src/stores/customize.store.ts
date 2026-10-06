import type { MetadataInformatedList } from "scnexus-standard/metadata";

export type CustomizeStore = {
  _schemaVersion: number;
  _revision: number;
  ININTIALIZED: boolean;
  LAST_REFRESH_TIME: number;
  CUSTOMIZE_LIST: MetadataInformatedList;
};
