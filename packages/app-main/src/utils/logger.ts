import { app } from "electron";
import logger from "electron-log/main";

export const Logger = logger;

export function initLogger() {
  const log_level = app.isPackaged ? "info" : "silly";

  Logger.transports.console.level = log_level;
  Logger.transports.console.format = "{h}:{i}:{s}.{ms} [SCNexus/main] > {text}";

  Logger.transports.file.level = log_level;
  Logger.transports.file.format =
    "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [SCNexus/Main] {text}";

  Logger.info("Logger Initialized");
}
