import { ipcHandle } from "../../utils/ipc-util";
import * as service from "./campaign";
import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";
export function initCampaignIpc() {
  ipcHandle("campaign:get-campaign-lists", () => ({
    CAMPAIGN_LIST_SET: Object.fromEntries(
      ["WOL", "HOTS", "LOTV", "NCO"].map((c) => [
        c,
        service
          .list()
          .records.filter((r) => r.package.campaign === c)
          .map((r) => ({
            ...r.package,
            localId: r.localId,
            type: "Campaign",
            localinfo: {
              metadata_path: r.descriptorPath,
              files_size: r.bytes,
              files_count: r.fileCount,
            },
          })),
      ]),
    ),
  }));
  ipcHandle("campaign:update-campaign-lists", service.scan);
  ipcHandle("campaign:get-actived-campaign-list", () => ({
    CAMPAIGN_SET: service.getActive().active,
  }));
  ipcHandle(
    "campaign:get-actived-campaign-typed",
    (type: string) => service.getActive().active[type as "WOL"],
  );
  ipcHandle("campaign:update-actived-campaign-set", service.scan);

  for (const action of [
    "unzip-compress-file-ccm",
    "unzip-compress-file-simulate-ccm",
    "unzip-compress-file-7z-simulate-ccm",
    "uninstall-campaign-files",
    "active-campaign",
    "unactive-campaign",
    "recover-campaign-type",
  ])
    ipcHandle("campaign:" + action, () => {
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT, {
        message: "Use the analyzed install/activation/removal workflow",
      });
    });

  ipcHandle("campaign:prepare-activation", service.prepareActivation);
  ipcHandle("campaign:activate", service.activate);
  ipcHandle("campaign:active", service.getActive);
  ipcHandle("campaign:prepare-deactivation", service.prepareDeactivation);
  ipcHandle("campaign:deactivate", service.deactivate);
  ipcHandle("campaign:analyze", service.analyze);
  ipcHandle("campaign:install", service.install);
  ipcHandle("campaign:list", service.list);
  ipcHandle("campaign:scan", service.scan);
  ipcHandle("campaign:prepare-uninstall", service.prepareUninstall);
  ipcHandle("campaign:uninstall", service.uninstall);
}
