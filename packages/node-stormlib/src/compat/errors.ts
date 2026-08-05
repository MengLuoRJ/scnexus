/**
 * Structured error type for StormLib failures.
 *
 * The native layer attaches a numeric `code` (the StormLib/Win32-style error
 * code from `SErrGetLastError()`) and a symbolic `codeName` to every error it
 * throws or rejects with. The wrapper layer converts those plain errors into
 * `StormError` instances so callers can use `instanceof` and switch on codes.
 */

/** Well-known StormLib error codes (Win32-style, identical on all platforms). */
export enum StormErrorCode {
  Success = 0,
  FileNotFound = 2,
  AccessDenied = 5,
  InvalidHandle = 6,
  NotEnoughMemory = 8,
  NotSupported = 50,
  InvalidParameter = 87,
  NegativeSeek = 131,
  DiskFull = 112,
  AlreadyExists = 183,
  InsufficientBuffer = 122,
  BadFormat = 1000,
  NoMoreFiles = 1001,
  HandleEof = 1002,
  CanNotComplete = 1003,
  FileCorrupt = 1004
}

export class StormError extends Error {
  /** Numeric StormLib error code (see {@link StormErrorCode}). */
  readonly code: number;
  /** Symbolic name of the error code, e.g. `"ERROR_FILE_NOT_FOUND"`. */
  readonly codeName: string;

  constructor(message: string, code: number = 0, codeName: string = 'UNKNOWN') {
    super(message);
    this.name = 'StormError';
    this.code = code;
    this.codeName = codeName;
  }

  /**
   * Convert an error thrown by the native layer into a StormError,
   * preserving the original stack. Non-native errors pass through unchanged.
   *
   * Detection is shape-based (not `instanceof Error`) because native-created
   * errors come from the real Node realm, which differs from the `Error`
   * global inside VM-based test runners like Jest.
   */
  static from(err: unknown): unknown {
    if (err instanceof StormError) return err;
    if (
      typeof err === 'object' && err !== null &&
      typeof (err as { message?: unknown }).message === 'string' &&
      typeof (err as { code?: unknown }).code === 'number'
    ) {
      const native = err as { message: string; code: number; codeName?: string; stack?: string };
      const wrapped = new StormError(native.message, native.code, native.codeName ?? 'UNKNOWN');
      wrapped.stack = native.stack ?? wrapped.stack;
      return wrapped;
    }
    return err;
  }
}

/** Run a synchronous native call, translating native errors into StormError. */
export function invoke<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw StormError.from(err);
  }
}

/** Await a native promise, translating native rejections into StormError. */
export async function invokeAsync<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    throw StormError.from(err);
  }
}
