export type PackageType = "campaign" | "customize" | string;

export type PackageCampaignType = "WOL" | "HOTS" | "LOTV" | "NCO";

export type PackageRichInfo = {
  website?: string;
  social?: {
    twitter?: string;
    discord?: string;
    youtube?: string;
    weibo?: string;
    bilibili?: string;
    qq_group?: string;
  };
  sponsor?: {
    paypal?: string;
    patreon?: string;
    buymeacoffee?: string;
    afdian?: string;
  };
};

export type Package = {
  scnid?: number;
  name: string;
  description: string;
  tags?: string[];
  version: string;
  author: string;
  localization?: {
    /**
     * The locale name, should be one of the supported locales.
     * @example `zn-CN`
     */
    locale: string;
    /**
     * The name of the Customize in this locale.
     * @example `Wings of Liberty`
     */
    name?: string;
    /**
     * The description of the Customize in this locale.
     */
    description?: string;
    /**
     * The name of the author in this locale
     */
    author?: string;
    /**
     * The semver version of the Customize in this locale.
     * @example `0.0.1`
     */
    version?: string;
    /**
     * The translaors of this localization.
     */
    translators?: string[];
  }[];
  /**
   * Type of the metadata.
   *
   * `"campaign"` will turn this file set into Campaign Package,
   * which will include the process of official campaigns' file in `<GameRoot>\Maps\Campaign`.
   *
   * `"customize"` means this file is a Customize Mod / Project.
   *
   * @value `campaign` | `customize`
   */
  type: PackageType;
  /**
   * The campaign type of the Package if the type is `campaign`.
   * @value `WOL` | `HOTS` | `LOTV` | `NCO`
   * @default undefined
   */
  campaign?: PackageCampaignType;
  /**
   * Informations about *.SC2Map files.
   */
  maps?: {
    /**
     * Name of the map file, should with `.SC2Map` extension.
     * @example `Level1.SC2Map`
     */
    name: string;
    description?: string;
    version?: string;
    /**
     * Source path to the map file in the compress file or develop directory.
     * @example '/Mods/Level1.SC2Map'
     */
    source_path: string;
    /**
     * Taget path for the map file after decompress or install
     * @example '/Mods/Level1.SC2Map'
     */
    target_path?: string;
    /**
     * If the file is saved as Components files
     * @default undefined
     */
    components?: boolean;
  }[];
  /**
   * Informations about *.SC2Mod files.
   */
  mods?: {
    /**
     * Name of the mod file, should with `.SC2Mod` extension.
     * @example `CoreFeatures.SC2Mod`
     */
    name: string;
    description?: string;
    version?: string;
    /**
     * Source path to the mod file in the compress file or develop directory.
     * @example '/Mods/CoreFeatures.SC2Mod'
     */
    source_path: string;
    /**
     * Taget path for the mod file after decompress or install
     * @example '/Mods/CoreFeatures.SC2Mod'
     */
    target_path?: string;
    /**
     * If the file is saved as Components files
     * @default undefined
     */
    components?: boolean;
  }[];
  /**
   * Declear the dependencis will that be used, these usually to include mods files that not been delivered within this package.
   *
   * *This filed is designed to replace upsteam mods function.*
   *
   * @experimental
   */
  dependencies?: {
    scnid?: number;
    version?: string;
  }[];
  /**
   * The luancher map file which will be run when player play this customize.
   */
  luancher?: {
    /**
     * Name of the map file, should with `.SC2Map` extension, and match one of the `maps`.
     * @example `Luancher.SC2Map`
     */
    name: string;
    description?: string;
  };
  /**
   * Declear the bank type that be used when `type` set to `"Campaign"`
   *
   * `"official"` means using the banks that set in the official campaigns.
   *
   * `"custom"` means using customed bank that set by content creator,
   * which should be set in `banks` field with their names.
   */
  bank_enable?: "offcial" | "custom";
  banks?: {
    name: string;
    description?: string;
  }[];
  /**
   * Specify the manager of this Customize.
   *
   * `"SCNexus"` means this file should be treat by SCNexus Manager within SCNexus Standard.
   *
   * `"CCM"` meas this file is following CCM standard, which will be treat as CCM simulately.
   *
   * This default to `undefined` which means the manager is not specified,
   * then will be determined by the package file,
   * `package.json` will be `SCNexus`, and `metadata.txt` will be `CCM`.
   *
   * @value `SCNexus` | `CCM`
   * @default undefined
   */
  manager?: "SCNexus" | "CCM";
} & PackageRichInfo;
