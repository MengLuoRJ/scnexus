import {
  ProfileCampaign,
  ProfileCustomize,
  ProfileDocuments,
  ProfileGame,
} from "@/types/profile.type";

export type ProfileStore = {
  SUCCESS: boolean;
  ERROR_MESSAGE?: string;
  PATH_WHITE_LIST?: string[];
  PROFILE_GAME: ProfileGame;
  PROFILE_DOCUMENTS: ProfileDocuments;
  PROFILE_CAMPAIGN: ProfileCampaign;
  PROFILE_CUSTOMIZE: ProfileCustomize;
};
