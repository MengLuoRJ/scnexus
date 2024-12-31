import { apiDeepLinkOnAuthentication } from "@scnexus/app-shared/ipc/deep-link";
import { exposeSubscribe } from "./common.js";

exposeSubscribe("apiDeepLinkOnAuthentication", apiDeepLinkOnAuthentication);
