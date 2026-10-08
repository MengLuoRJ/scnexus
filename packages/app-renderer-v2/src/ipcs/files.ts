import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";
export function getPathForFile(file: File): string {
  if (!window.webUtils)
    throw new AppError(ERRORS.IPC_TRANSPORT_FAILED, { message: "File bridge is unavailable" });
  return window.webUtils.getPathForFile(file);
}
