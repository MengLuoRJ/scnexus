export type MetadataType = "Campaign" | "Customize" | string;

export type CampaignType = "WOL" | "HOTS" | "LOTV" | "NCO";

export type Metadata = {
  snid?: string;
  name: string;
  description: string;
  version: string;
  author: string;
  localizations?: {
    /**
     * The locale name, should be the same as the file name.
     * @example `zn-CN`
     */
    locale: string;
    /**
     * The name of the Customize in the locale.
     * @example `Wings of Liberty`
     */
    name: string;
    /**
     * The description of the Customize in the locale.
     * /
    description: string;
    /**
     * The semver version of the Customize in the locale.
     * @example `0.0.1`
     */
    version: string;
    /**
     * The translaors of the localization.
     */
    translator: string[];
  }[];
  /**
   * Type of the metadata.
   * @value `Campaign` | `Customize`
   */
  type: MetadataType;
  /**
   * The campaign type of the Customize if the type is `Campaign`.
   * @value `WOL` | `HOTS` | `LOTV` | `NCO`
   * @default undefined
   */
  campaign?: CampaignType;
  /**
   * The luancher map file which will be run when player play this customize.
   */
  luancher?: {
    map_name: string;
  };
  /**
   * Relative path to the Maps folder from the map file.
   * Not used as default when the map files are in the root of the Maps folder.
   *
   * **Recommended** to set this key to avoid the conflict with other Customizes.
   *
   * Default set to `undefined` which means `<GameRoot>/Maps/*`
   * @default undefined
   */
  maps_directory?: string;
  /**
   * Informations about *.SC2Map files.
   *
   * **File Path:** `<GameRoot>/Maps/<maps_directory>/<map.relative_path>/<map.name>`
   */
  maps?: {
    /**
     * Name of the map file, should with `.SC2Map` extension.
     * @example `Level1.SC2Map`
     */
    name: string;
    description: string;
    version?: string;
    /**
     * If the file is saved as Components files
     * @default undefined
     */
    components?: boolean;
    /**
     * Relative path to the `maps_directory` from the map file.
     * Not used as default when the map files are in the `maps_directory` folder.
     * @default undefined
     */
    relative_path?: string;
  }[];
  /**
   * Relative path to the Mods folder from the mod file.
   * Not used as default when the mod files are in the root of the Mods folder.
   *
   * **Recommended** to set this key to avoid the conflict with other Customizes.
   *
   * Default set to `undefined` which means `<GameRoot>/Mods/*`
   * @default undefined
   */
  dependencies_directory?: string;
  /**
   * Informations about *.SC2Mod files.
   *
   * **File Path:** `<GameRoot>/Mods/<dependencies_directory>/<dependencies.relative_path>/<dependencies.name>`
   */
  dependencies?: {
    name: string;
    description: string;
    version?: string;
    /**
     * If the file is saved as Components files
     * @default undefined
     */
    components?: boolean;
    /**
     * Relative path to the `dependencies_directory` folder from the mod file.
     * Not used as default when the mod files are in the `dependencies_directory` folder.
     * @default undefined
     */
    relative_path?: string;
    /**
     * Determine if this dependency is on upstream.
     * 
     * If set to `true`, the dependency will require the player to install the upstream dependency first,
     * and the Customize compressed file can be without this dependency file.
     * 
     * @default false 
     */
    upstream?: boolean;
  }[];
  campaign_bank?: "offcial" | "custom" | "inactive";
  banks?: {
    name: string;
    description: string;
    version?: string;
  }[];
  /**
   * Specify the manager of this Customize.
   *
   * This default to `undefined` which means the manager is not specified,
   * then will be determined by the metadata file extension,
   * `metadata.json` will be `SCNexus` and `metadata.txt` will be `CCM`.
   *
   * @value `SCNexus` | `CCM`
   * @default undefined
   */
  manager?: "SCNexus" | "CCM";
};

export type MetadataRichinfo = {
  website?: string;
  social?: {
    general?: string;
    twitter?: string;
    discord?: string;
    youtube?: string;
    weibo?: string;
    bilibili?: string;
    qq_group?: string;
    wechat_official_account?: string;
  };
  donate?: {
    general?: string;
    paypal?: string;
    patreon?: string;
    buymeacoffee?: string;
    afdian?: string;
  };
};

export type MetadataLocal = {
  /**
   * Path to the metadata file.
   * 
   * This path will only be used for installed Customizes & Campaigns, and actived Campaigns.
   * 
   * Those actived Customizes won't have this key as they have been pushed into <GameRoot> Mods/Maps.
   * 
   * @example `C:/StarCraft II/SCNexusLibrary/Customize/<custmoze>/metadata.json`
   * @default undefined
   */
  metadata_path?: string;
  /**
   * Size of the file in bytes.
   */
  total_size?: number;
  file_count?: number;
};

export type MetadataStandard = Metadata & {
  richinfo?: MetadataRichinfo;
};

export type MetadataCampaign = Omit<MetadataStandard, "maps"> & {
  type: "Campaign";
};

export type MetadataCampaignSet = Record<
  CampaignType,
  MetadataCampaign | undefined
>;

export type CampaignInformation = MetadataCampaign & {
  /**
   * Local information for the metadata file
   * @type {MetadataLocal}
   */
  local: MetadataLocal;
};

export type CampaignInformationSet = Record<
  CampaignType,
  CampaignInformation | undefined
>;

export type CampaignInformationListSet = Record<
  CampaignType,
  CampaignInformation[] | undefined
>;

export type MetadataCustomize = Omit<MetadataStandard, "campaign_bank"> & {
  type: "Customize";
};

export type MetadataCustomizeList = MetadataCustomize[];

export type CustomizeInformation = MetadataCustomize & {
  local: MetadataLocal;
};

export type CustomizeInformationList = CustomizeInformation[];
