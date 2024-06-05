import { initAppModule } from "./App";
import { initDeepLinkModule } from "./DeepLink";
import { initDialogModule } from "./Dialog";
import { initShellModule } from "./Shell";
import { initUpdaterModule } from "./Updater";

export function initCommonModule() {
  initAppModule();
  initDeepLinkModule();
  initDialogModule();
  initShellModule();

  initUpdaterModule();
}
