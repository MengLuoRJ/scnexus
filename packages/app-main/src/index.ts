import { app, Menu, } from "electron";
import { release } from "node:os";
import { initModules } from "./modules/init";
import { initLogger } from "./utils/logger";
import { initSentry } from "./utils/sentry";
import {
  destroyMainWindow,
  getMainWindow,
  restoreOrCreateWindow,
} from "./mainWindows";

// init electron-log
initLogger();
// init Sentry main
initSentry();

// process.env.PUBLIC = process.env.VITE_DEV_SERVER_URL
//   ? join(process.env.DIST_ELECTRON, "../public")
//   : process.env.DIST;

// Disable GPU Acceleration for Windows 7
if (release().startsWith("6.1")) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === "win32") app.setAppUserModelId(app.getName());

/**
 * Prevent electron from running multiple instances.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Remove electron security warnings
// This warning only shows in development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
// process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

app.on("second-instance", restoreOrCreateWindow);

app.on("window-all-closed", () => {
  destroyMainWindow();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", restoreOrCreateWindow);

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // Initialize all modules.
  await initModules();

  // Create the main window when the application is ready
  await restoreOrCreateWindow();
});

app.on("open-url", (event, url) => {
  getMainWindow()?.webContents.send("open-url", url);
});
