import { app } from "electron";
import { resolve } from "node:path";
import { getMainWindow } from "@/mainWindows";

export function initDeepLinkModule() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("scnexus", process.execPath, [
        resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient("scnexus");
  }

  app.on("open-url", (event, url) => {
    processUrl(url);
  });

  app.on("second-instance", (event, commandLine) => {
    processUrl(commandLine.pop() ?? "");
  });
}

function processUrl(url: string) {
  if (url.startsWith("scnexus://authentication")) {
    processAuthenticationUrl(url);
  }
  if (url.startsWith("scnexus://workshop")) {
    processWorkshopUrl(url);
  }
  // win?.webContents.send("deeplink:open-url", url);
}

function processAuthenticationUrl(url: string) {
  const params = new URL(url).searchParams;
  const data = {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
  };
  getMainWindow()?.webContents.send("deeplink:authentication", data);
}

function processWorkshopUrl(url: string) {
  getMainWindow()?.webContents.send(
    "deeplink:workshop",
    url.split("scnexus://workshop/")[1]
  );
}
