export type ProfileGame = {
  GAME_ROOT: string;
  GAME_VERSION: string;
  GAME_CLIENT: string;
  GAME_EXECUTABLE_X64: string;
  GAME_EDITOR_EXECUTABLE_X64: string;
  GAME_MODS_PATH: string;
  GAME_MAPS_PATH: string;
};

export type ProfileDocuments = {
  DOCUMENTS_ROOT: string;
  DOCUMENTS_LOCAL_BANKS_ROOT: string;
  DOCUMENTS_ARCADE_BANKS_ROOT: string;
};

export type ProfileCampaign = {
  LIBRARY_ROOT: string;
  CCM_ROOT: string;
  MODS_ROOT: string;
  MAPS_ROOT: string;
  WOL_ROOT: string;
  HOTS_ROOT: string;
  HOTS_EVO_ROOT: string;
  LOTV_ROOT: string;
  LOTV_PRO_ROOT: string;
  NCO_ROOT: string;
};

export type ProfileCustomize = {
  LIBRARY_ROOT: string;
  MODS_ROOT: string;
  MAPS_ROOT: string;
};
