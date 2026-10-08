import { getCurrentScope, onScopeDispose } from "vue";
import {
  AppError,
  ERRORS,
  isErrorDto,
  toErrorDto,
  type IpcResult,
} from "@scnexus/app-shared/errors/app.error";
import type { DesktopApi } from "@scnexus/app-shared/types/desktop.type";

export function desktop(): DesktopApi {
  if (!window.scnexus)
    throw new AppError(ERRORS.IPC_TRANSPORT_FAILED, { message: "Desktop bridge is unavailable" });
  return window.scnexus;
}

export async function request<T>(run: () => Promise<IpcResult<T>>): Promise<IpcResult<T>> {
  try {
    const result = await run();
    if (result?.ok === true && Object.hasOwn(result, "data")) return result;
    if (result?.ok === false && isErrorDto(result.error)) return result;
    return { ok: false, error: toErrorDto(new AppError(ERRORS.IPC_RESULT_INVALID)) };
  } catch (cause) {
    const error =
      cause instanceof AppError ? cause : new AppError(ERRORS.IPC_TRANSPORT_FAILED, {}, { cause });
    return { ok: false, error: toErrorDto(error) };
  }
}

export async function unwrap<T>(result: Promise<IpcResult<T>>): Promise<T> {
  const response = await result;
  if (response.ok) return response.data;
  throw response.error;
}

export function subscription<T>(
  subscribe: (listener: (data: T) => void) => () => void,
  listener: (data: T) => void,
): () => void {
  const dispose = subscribe(listener);
  let active = true;
  const stop = () => {
    if (active) {
      active = false;
      dispose();
    }
  };
  if (getCurrentScope()) onScopeDispose(stop);
  return stop;
}
