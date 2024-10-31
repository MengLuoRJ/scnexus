type MetadataType = "Campaign" | "Customize" | string;
type CampaignType = "WOL" | "HOTS" | "LOTV" | "NCO";
type Metadata = {
    snid?: number;
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
     * `"Campaign"` will turn this file set into Campaign Package,
     * which will include the process of official campaigns' file in `<GameRoot>\Maps\Campaign`.
     *
     * `"Customize"` means this file is a Customize Mod / Project.
     *
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
        description?: string;
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
    mods_directory?: string;
    /**
     * Informations about *.SC2Mod files.
     *
     * **File Path:** `<GameRoot>/Mods/<mods_directory>/<mods.relative_path>/<mods.name>`
     */
    mods?: {
        name: string;
        description?: string;
        version?: string;
        /**
         * If the file is saved as Components files
         * @default undefined
         */
        components?: boolean;
        /**
         * Relative path to the `mods_directory` folder from the mod file.
         * Not used as default when the mod files are in the `mods_directory` folder.
         * @default undefined
         */
        relative_path?: string;
        /**
         * **[Experimental Functional]** This would be replaced with other function
         *
         * Determine if this dependency is on upstream.
         *
         * If set to `true`, the dependency will require the player to install the upstream dependency first,
         * and the Customize compressed file can be without this dependency file.
         *
         * @experimental
         *
         * @default false
         */
        upstream?: boolean;
    }[];
    /**
     * Declear the dependencis will that be used, these usually to include mods files that not been delivered within this package.
     *
     * *This filed is designed to replace upsteam mods function.*
     *
     * @experimental
     */
    dependencies?: {
        name: string;
        description: string;
        version?: string;
    }[];
    /**
     * The luancher map file which will be run when player play this customize.
     */
    luancher?: {
        map_name: string;
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
        description: string;
        version?: string;
    }[];
    /**
     * Specify the manager of this Customize.
     *
     * `"SCNexus"` means this file should be treat by SCNexus Manager within SCNexus Standard.
     *
     * `"CCM"` meas this file is following CCM standard, which will be treat as CCM simulately.
     *
     * This default to `undefined` which means the manager is not specified,
     * then will be determined by the metadata file extension,
     * `metadata.json` will be `SCNexus`, and `metadata.txt` will be `CCM`.
     *
     * @value `SCNexus` | `CCM`
     * @default undefined
     */
    manager?: "SCNexus" | "CCM";
    /**
     * The mode that how should the manager treat this package.
     *
     * `"standard"` means the manager will recognize and process the compressed file strictly,
     * which following the standard and the settings in this metadata file.
     *
     * **Please use `"standard"` as possible, low level modes as follow are not safe.**
     *
     * `"paths_math"` means the manager will recognize files by locating paths,
     * that decides which directory the file should be placed,
     * **path** (e.g. "Maps", "Mods") and **file extension** (e.g. ".SC2Map") will be recognized.
     * the standard and the setting in this metadata file will be ignored.
     *
     * @default `standard`
     */
    manager_mode?: "standard" | "paths_match";
};
type MetadataRichinfo = {
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
type MetadataLocalinfo = {
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
     * Size of the files in bytes (Byte).
     */
    files_size?: number;
    files_count?: number;
};
type MetadataStandard = Metadata & MetadataRichinfo;
type MetadataInformated = MetadataStandard & {
    localinfo: MetadataLocalinfo;
};
type MetadataInformatedList = MetadataInformated[];
type MetadataInformatedCampaignSet = Record<CampaignType, MetadataInformated | undefined>;
type MetadataInformatedCampaignListSet = Record<CampaignType, MetadataInformatedList>;

export type { CampaignType, Metadata, MetadataInformated, MetadataInformatedCampaignListSet, MetadataInformatedCampaignSet, MetadataInformatedList, MetadataLocalinfo, MetadataRichinfo, MetadataStandard, MetadataType };
