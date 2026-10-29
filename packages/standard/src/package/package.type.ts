export type PackageType = 'campaign' | 'customize' | 'dependency'
export type PackageCampaignType = 'WOL' | 'HOTS' | 'LOTV' | 'NCO'

export type PackageResource = {
  /** File or component-directory name, including the SC2Map/SC2Mod extension. */
  name: string
  description?: string
  version?: string
  /** Package-relative logical path beginning with /Maps/ or /Mods/. */
  source_path: string
  /** Installation target using the same logical prefix as source_path. */
  target_path?: string
  components?: boolean
}
export type PackageMap = Omit<PackageResource, 'name' | 'source_path' | 'target_path'> & {
  /** @pattern \.[sS][cC]2[mM][aA][pP]$ */
  name: string
  /** @pattern ^/Maps/ */
  source_path: string
  /** @pattern ^/Maps/ */
  target_path?: string
}
export type PackageMod = Omit<PackageResource, 'name' | 'source_path' | 'target_path'> & {
  /** @pattern \.[sS][cC]2[mM][oO][dD]$ */
  name: string
  /** @pattern ^/Mods/ */
  source_path: string
  /** @pattern ^/Mods/ */
  target_path?: string
}
export type PackageSocial = {
  twitter?: string
  discord?: string
  youtube?: string
  weibo?: string
  bilibili?: string
  qq_group?: string
}
export type PackageSponsor = {
  paypal?: string
  patreon?: string
  buymeacoffee?: string
  afdian?: string
}
export type PackageLocalization = {
  /** Locale identifier, e.g. zh-CN. */
  locale: string
  name?: string
  description?: string
  author?: string
  version?: string
  translators?: string[]
}
/** A dependency reference, not the dependency package itself. */
export type PackageDependencyReference = {
  /**
   * @asType integer
   * @minimum 0
   * @maximum 9007199254740991
   */
  scnid?: number
  version?: string
}
export type PackageLauncher = {
  /** Must match a declared maps entry. */
  name: string
  description?: string
}
export type PackageBank = {
  name: string
  description?: string
}
export type PackageBase = {
  /** Optional editor schema association; never fetched by package validation. */
  $schema?: string
  /**
   * @asType integer
   * @minimum 0
   * @maximum 9007199254740991
   */
  scnid?: number
  /** @pattern \S */
  name: string
  description: string
  tags?: string[]
  version: string
  author: string
  website?: string
  /** Archive-root-relative documentation path; resolved by the client, not validation. */
  readme?: string
  /** Archive-root-relative changelog path; resolved by the client, not validation. */
  changelog?: string
  /** Archive-root-relative additional documentation paths. */
  docs?: string[]
  /** Archive-root-relative attachment allowlist; only segment-local * and whole-segment **. */
  assets?: string[]
  social?: PackageSocial
  sponsor?: PackageSponsor
}
type PackageContentBase = PackageBase & {
  campaign?: PackageCampaignType
  localization?: PackageLocalization[]
  maps?: PackageMap[]
  mods?: PackageMod[]
  /** Descriptive/experimental; the client does not resolve or install these automatically. */
  dependencies?: PackageDependencyReference[]
  /** Optional launcher referencing a declared map. */
  launcher?: PackageLauncher
  /** Bank migration is not implemented by this declaration. */
  bank_enable?: 'official' | 'custom'
  banks?: PackageBank[]
  manager?: 'SCNexus' | 'CCM'
}
export type PackageContent = PackageContentBase &
  (
    | {
        type: 'campaign'
        /** Archive-root-relative banner path; resolved by the client, not validation. */
        banner?: string
        cover?: never
      }
    | {
        type: 'customize'
        /** Archive-root-relative cover path; resolved by the client, not validation. */
        cover?: string
        banner?: never
      }
  )
/** Mod-only package for SCNexus management; CCM and client installation are not supported. */
export type PackageDependency = PackageBase & {
  type: 'dependency'
  mods?: PackageMod[]
}
export type PackageCampaign = PackageContent & {
  type: 'campaign'
  campaign: PackageCampaignType
}
export type PackageCustomize = PackageContent & {
  type: 'customize'
}
export type Package = PackageContent | PackageDependency
