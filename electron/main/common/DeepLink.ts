import { app } from "electron";
import { resolve } from "node:path";

export function initDeepLink(win: Electron.BrowserWindow) {
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
    processUrl(win, url);
  });

  app.on("second-instance", (event, commandLine) => {
    processUrl(win, commandLine.pop()?.slice(0, -1) ?? "");
  });
}

function processUrl(win: Electron.BrowserWindow, data: string) {
  if (processAuthenticationUrl(win, data)) {
    return;
  }
  win?.webContents.send("deeplink::open-url", data);
}

function processAuthenticationUrl(win: Electron.BrowserWindow, url: string) {
  if (url.startsWith("scnexus://authentication/")) {
    const data = url.replace("scnexus://authentication/", "");
    win?.webContents.send("deeplink::authentication", data);
    return true;
  }
  return false;
}
