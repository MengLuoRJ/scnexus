import { getMainWindow } from "@/mainWindows";
import { initCampaignModule } from "./campaign";
import { initCommonModule } from "./common";
import { initCustomizeModule } from "./customize";
import { initProfileModule } from "./profile";
import { initSettingModule } from "./setting";
import { initWorkshopModule } from "./workshop";

export async function initModules() {
  initCommonModule();

  await initSettingModule();
  await initProfileModule();

  // CampaignModule and CustomizeModule need to
  // be init after ProfileModule inited succesfully
  await initCampaignModule();
  await initCustomizeModule();

  await initWorkshopModule();
}
