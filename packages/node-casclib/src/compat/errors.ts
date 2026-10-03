/**
 * Structured error type for CascLib failures.
 *
 * The native layer attaches a numeric `code` (the CascLib/Win32-style error
 * code from `GetCascError()`) and a symbolic `codeName` to every error it
 * throws or rejects with. The wrapper layer converts those plain errors into
 * `CascError` instances so callers can use `instanceof` and switch on codes.
 */

/** Well-known CascLib error codes (Win32-style, identical on all platforms). */
export enum CascErrorCode {
  Success = 0,
  FileNotFound = 2,
  AccessDenied = 5,
  InvalidHandle = 6,
  NotEnoughMemory = 8,
  NotSupported = 50,
  InvalidParameter = 87,
  DiskFull = 112,
  AlreadyExists = 183,
  InsufficientBuffer = 122,
  BadFormat = 1000,
  NoMoreFiles = 1001,
  HandleEof = 1002,
  CanNotComplete = 1003,
  FileCorrupt = 1004,
  FileEncrypted = 1005,
  FileTooLarge = 1006,
  NetworkNotAvailable = 1008,
  Cancelled = 1010
}

export class CascError extends Error {
  /** Numeric CascLib error code (see {@link CascErrorCode}). */
  readonly code: number;
  /** Symbolic name of the error code, e.g. `"ERROR_FILE_NOT_FOUND"`. */
  readonly codeName: string;

  constructor(message: string, code: number = 0, codeName: string = 'UNKNOWN') {
    super(message);
    this.name = 'CascError';
    this.code = code;
    this.codeName = codeName;
  }

  /**
   * Convert an error thrown by the native layer into a CascError,
   * preserving the original stack. Non-native errors pass through unchanged.
   *
   * Detection is shape-based (not `instanceof Error`) because native-created
   * errors come from the real Node realm, which differs from the `Error`
   * global inside VM-based test runners like Jest.
   */
  static from(err: unknown): unknown {
    if (err instanceof CascError) return err;
    if (
      typeof err === 'object' && err !== null &&
      typeof (err as { message?: unknown }).message === 'string' &&
      typeof (err as { code?: unknown }).code === 'number'
    ) {
      const native = err as { message: string; code: number; codeName?: string; stack?: string };
      const wrapped = new CascError(native.message, native.code, native.codeName ?? 'UNKNOWN');
      wrapped.stack = native.stack ?? wrapped.stack;
      return wrapped;
    }
    return err;
  }
}

/** Run a synchronous native call, translating native errors into CascError. */
export function invoke<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw CascError.from(err);
  }
}

/** Await a native promise, translating native rejections into CascError. */
export async function invokeAsync<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    throw CascError.from(err);
  }
}
