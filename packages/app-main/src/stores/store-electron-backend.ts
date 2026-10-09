import { copyFileSync, constants, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Options } from 'electron-store'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { invalidData, isRecord } from './store-repository'
import type { PersistenceBackend, RepositoryOptions, StoreVersion } from './store-repository'

export async function createElectronBackend(
  name: string,
  directory: string,
): Promise<PersistenceBackend> {
  const { default: Store } = await import('electron-store')
  const path = join(directory, `${name}.json`)
  function backup(reason: 'migration' | 'corrupt') {
    copyFileSync(path, `${path}.${reason}-${randomUUID()}.bak`, constants.COPYFILE_EXCL)
  }
  return {
    open<T extends StoreVersion>(options: RepositoryOptions<T>) {
      let raw: string | undefined
      try {
        raw = readFileSync(path, 'utf8')
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new AppError(ERRORS.STORE_READ_FAILED, {}, { cause })
      }
      const defaults = options.defaults()
      const config: Options<T> = {
        name,
        cwd: directory,
        schema: options.schema,
        rootSchema: {
          additionalProperties: false,
          required: Object.keys(options.schema).filter(
            (key) => !options.optionalKeys?.includes(key as keyof T),
          ),
        },
        ajvOptions: { useDefaults: false },
        clearInvalidConfig: false,
        watch: false,
        accessPropertiesByDotNotation: false,
      }
      let stagedPath: string | undefined
      try {
        // Only startup inspects legacy JSON. Daily reads/writes belong to electron-store.
        const loaded: unknown = raw === undefined ? undefined : JSON.parse(raw)
        if (loaded !== undefined && !isRecord(loaded)) invalidData('Expected a store object')
        const data = loaded as Record<string, unknown> | undefined
        for (const version of [data?._schemaVersion, data?.schemaVersion]) {
          if (typeof version === 'number' && version > defaults._schemaVersion)
            throw new AppError(ERRORS.STORE_VERSION_UNSUPPORTED)
        }
        if (
          raw !== undefined &&
          (data?._schemaVersion === undefined || data._schemaVersion !== defaults._schemaVersion)
        ) {
          let candidate: T
          if (data?.schemaVersion !== undefined) {
            const { schemaVersion, revision, lastConfirmedVersion, ...fields } = data
            candidate = {
              ...fields,
              _schemaVersion: schemaVersion,
              _revision: revision,
              ...(Object.hasOwn(defaults, '_lastConfirmedVersion')
                ? { _lastConfirmedVersion: lastConfirmedVersion }
                : Object.hasOwn(data, 'lastConfirmedVersion')
                  ? { lastConfirmedVersion }
                  : {}),
            } as T
          } else {
            candidate = options.migrate(data, defaults)
          }
          if (candidate._schemaVersion !== defaults._schemaVersion)
            candidate = options.migrate(candidate, defaults)
          options.validate(candidate)
          const stagedName = `${name}.migration-${randomUUID()}`
          stagedPath = join(directory, `${stagedName}.json`)
          // Validate and atomically serialize the target using the same real schema.
          new Store<T>({ ...config, name: stagedName, defaults: candidate })
          try {
            backup('migration')
          } catch (cause) {
            throw new AppError(ERRORS.STORE_MIGRATION_FAILED, {}, { cause })
          }
          try {
            renameSync(stagedPath, path)
          } catch (cause) {
            throw new AppError(ERRORS.STORE_WRITE_FAILED, {}, { cause })
          }
        }
        if (raw === undefined) options.validate(defaults)
        const store = new Store<T>({
          ...config,
          ...(raw === undefined ? { defaults } : {}),
        })
        options.validate(store.store)
        return store
      } catch (cause) {
        if (
          cause instanceof AppError &&
          [
            ERRORS.STORE_VERSION_UNSUPPORTED.code,
            ERRORS.STORE_MIGRATION_FAILED.code,
            ERRORS.STORE_WRITE_FAILED.code,
          ].some((code) => code === cause.code)
        )
          throw cause
        const invalid =
          cause instanceof AppError ||
          cause instanceof SyntaxError ||
          (cause instanceof Error && cause.message.startsWith('Config schema violation:'))
        if (invalid && raw !== undefined) {
          try {
            backup('corrupt')
          } catch (backupCause) {
            throw new AppError(
              ERRORS.STORE_WRITE_FAILED,
              { message: 'Cannot back up invalid store' },
              { cause: backupCause },
            )
          }
        }
        throw new AppError(
          invalid ? ERRORS.STORE_DATA_INVALID : ERRORS.STORE_WRITE_FAILED,
          {},
          { cause },
        )
      } finally {
        if (stagedPath) rmSync(stagedPath, { force: true })
      }
    },
  }
}
