export type CampaignType = "WOL" | "HOTS" | "LOTV" | "NCO" | "CUSTOM";

export type CampaignMetadata = {
  name: string;
  description: string;
  author: string;
  type: CampaignType;
  version: string;
  dependencies?: {
    name: string;
    description: string;
    /**
     * Relative path to the Mods folder from the mod file.
     * Not used as default when the mod files are in the root of the Mods folder.
     * @default undefined
     */
    relative_path?: string;
  }[];
};

export type CampaignMetadataList = Record<
  CampaignType,
  CampaignMetadata | null
>;

export type LocalCampaignMetadata = {
  path: string;
  source?: "SCNexus" | "CCM" | string;
};

export type CampaignInformation = CampaignMetadata & LocalCampaignMetadata;

export type CampaignInformationList = Record<
  CampaignType,
  CampaignInformation[] | null
>;

export type CustomizeMetadata = {
  name: string;
  description: string;
  author: string;
  type: CampaignType;
  version: string;
  maps?: {
    name: string;
    description: string;
    /**
     * Relative path to the Maps folder from the map file.
     * Not used as default when the map files are in the root of the Maps folder.
     * @default undefined
     */
    relative_path?: string;
  }[];
  dependencies?: {
    name: string;
    description: string;
    /**
     * Relative path to the Mods folder from the mod file.
     * Not used as default when the mod files are in the root of the Mods folder.
     * @default undefined
     */
    relative_path?: string;
  }[];
};
