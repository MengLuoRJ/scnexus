import { ipcHandleTyped, ipcHandle } from "../../utils/ipc-util";
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

  ipcHandleTyped("campaign:prepare-activation", service.prepareActivation);
  ipcHandleTyped("campaign:activate", service.activate);
  ipcHandleTyped("campaign:active", service.getActive);
  ipcHandleTyped("campaign:prepare-deactivation", service.prepareDeactivation);
  ipcHandleTyped("campaign:deactivate", service.deactivate);
  ipcHandleTyped("campaign:analyze", service.analyze);
  ipcHandleTyped("campaign:install", service.install);
  ipcHandleTyped("campaign:list", service.list);
  ipcHandleTyped("campaign:scan", service.scan);
  ipcHandleTyped("campaign:prepare-uninstall", service.prepareUninstall);
  ipcHandleTyped("campaign:uninstall", service.uninstall);
}
