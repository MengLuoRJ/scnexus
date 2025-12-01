export class MpqError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MpqError";
  }
}

export class MpqFormatError extends MpqError {
  constructor(message: string) {
    super(message);
    this.name = "MpqFormatError";
  }
}

export class MpqFileNotFoundError extends MpqError {
  readonly path: string;

  constructor(path: string) {
    super(`File not found in MPQ archive: ${path}`);
    this.name = "MpqFileNotFoundError";
    this.path = path;
  }
}

export class MpqReadOnlyError extends MpqError {
  constructor() {
    super("MPQ archive was not opened in writable mode");
    this.name = "MpqReadOnlyError";
  }
}

export class MpqCompressionError extends MpqError {
  readonly compressionMask: number;

  constructor(compressionMask: number) {
    super(
      `Unsupported MPQ compression mask: 0x${compressionMask.toString(16).padStart(2, "0")}`,
    );
    this.name = "MpqCompressionError";
    this.compressionMask = compressionMask;
  }
}

export class MpqEncryptedFileError extends MpqError {
  readonly path?: string;

  constructor(path?: string) {
    super(
      path
        ? `Cannot decrypt MPQ file without its original name: ${path}`
        : "Cannot decrypt an unnamed MPQ file",
    );
    this.name = "MpqEncryptedFileError";
    this.path = path;
  }
}
