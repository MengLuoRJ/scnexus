import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";

import type { Schema } from "electron-store";

export type StoreVersion = { _schemaVersion: number; _revision: number };
export interface RepositoryOptions<T extends StoreVersion> {
  defaults: () => T;
  schema: Schema<T>;
  optionalKeys?: (keyof T)[];
  validate: (data: unknown) => void;
  migrate: (legacy: unknown, defaults: T) => T;
}
export interface PersistenceBackend {
  open<T extends StoreVersion>(options: RepositoryOptions<T>): { store: T };
}

export function invalidData(message: string): never {
  throw new AppError(ERRORS.STORE_DATA_INVALID, { message });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function validateSerializable(
  value: unknown,
  ancestors = new Set<object>(),
): void {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "boolean"
  )
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (
    typeof value !== "object" ||
    (!Array.isArray(value) && !isRecord(value)) ||
    ancestors.has(value)
  ) {
    invalidData("Store values must be JSON serializable");
  }
  ancestors.add(value);
  for (const child of Object.values(value))
    validateSerializable(child, ancestors);
  ancestors.delete(value);
}

export function createRepository<T extends StoreVersion>(
  options: RepositoryOptions<T>,
) {
  let store: { store: T } | undefined;

  function requireStore() {
    if (!store)
      throw new AppError(ERRORS.APP_INITIALIZATION_FAILED, {
        message: "Store is not initialized",
      });
    return store;
  }

  function init(persistence: PersistenceBackend): T {
    store ??= persistence.open(options);
    return getSnapshot();
  }

  function getSnapshot(): T {
    try {
      return structuredClone(requireStore().store);
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      throw new AppError(ERRORS.STORE_READ_FAILED, {}, { cause });
    }
  }

  function getKey<K extends keyof T>(key: K): T[K] {
    const current = getSnapshot();
    if (typeof key !== "string" || !Object.hasOwn(current, key))
      invalidData("Unknown store key");
    return current[key];
  }

  function update(data: T): T {
    const current = getSnapshot();
    let candidate: T;
    try {
      options.validate(data);
      validateSerializable(data);
      candidate = structuredClone(data);
      if (
        candidate._schemaVersion !== current._schemaVersion ||
        !Number.isSafeInteger(candidate._revision) ||
        candidate._revision < 0
      )
        invalidData("Invalid store version/revision");
      candidate._revision = current._revision + 1;
    } catch (cause) {
      throw new AppError(ERRORS.STORE_DATA_INVALID, {}, { cause });
    }
    try {
      requireStore().store = candidate;
    } catch (cause) {
      const invalid =
        cause instanceof Error &&
        cause.message.startsWith("Config schema violation:");
      throw new AppError(
        invalid ? ERRORS.STORE_DATA_INVALID : ERRORS.STORE_WRITE_FAILED,
        {},
        { cause },
      );
    }
    return getSnapshot();
  }

  function updateKey<K extends keyof T>(key: K, value: T[K]): T {
    if (key === "_schemaVersion" || key === "_revision")
      invalidData("Store version is managed by the repository");
    const candidate = getSnapshot();
    candidate[key] = value;
    return update(candidate);
  }

  return { init, getSnapshot, get: getSnapshot, getKey, updateKey, update };
}
