import { copyFile, mkdir, mkdtemp, lstat, rm, rename, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { reportOperationWarning } from '../../utils/operation-warnings'
export type WriteData = Buffer | null | { file: string } | { directory: string }
export async function fileTransaction<T>(
  root: string,
  run: (write: (path: string, data: WriteData) => Promise<void>) => Promise<T>,
  removeDirectories: string[] = [],
): Promise<T> {
  const backup = await mkdtemp(join(root, '.scnexus-operation-'))
  const undo: { path: string; backup: string | null }[] = []
  const directories: { path: string; backup: string }[] = []
  let retain = false
  const write = async (path: string, data: WriteData) => {
    let info
    try {
      info = await lstat(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (info && (!info.isFile() || info.isSymbolicLink() || (data && 'directory' in data)))
      throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
    if (data && 'directory' in data) {
      await mkdir(dirname(path), { recursive: true })
      await rename(data.directory, path)
      undo.push({ path, backup: null })
      return
    }
    const prior = info ? join(backup, String(undo.length)) : null
    if (prior) await copyFile(path, prior)
    undo.push({ path, backup: prior })
    if (data) {
      await mkdir(dirname(path), { recursive: true })
      const staged = join(backup, 'write-' + undo.length)
      if ('file' in data) await copyFile(data.file, staged)
      else await writeFile(staged, data)
      await rename(staged, path)
    } else await rm(path, { force: true })
  }
  try {
    for (const path of removeDirectories) {
      const moved = join(backup, 'directory-' + directories.length)
      await rename(path, moved)
      directories.push({ path, backup: moved })
    }
    return await run(write)
  } catch (cause) {
    const failures: unknown[] = []
    for (const item of undo.reverse()) {
      try {
        if (item.backup) {
          await mkdir(dirname(item.path), { recursive: true })
          await copyFile(item.backup, item.path)
        } else await rm(item.path, { recursive: true, force: true })
      } catch (error) {
        failures.push(error)
      }
    }
    for (const item of directories.reverse()) {
      try {
        await rename(item.backup, item.path)
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length) {
      retain = true
      throw new AppError(
        ERRORS.CAMPAIGN_RECOVERY_FAILED,
        { message: 'Rollback incomplete; recovery files retained' },
        { cause: new AggregateError([cause, ...failures]) },
      )
    }
    throw cause
  } finally {
    if (!retain) {
      try {
        await rm(backup, { recursive: true, force: true })
      } catch (cause) {
        reportOperationWarning(
          new AppError(
            ERRORS.CONTENT_CLEANUP_WARNING,
            {
              message: 'Operation backup cleanup failed; files retained',
            },
            { cause },
          ),
        )
      }
    }
  }
}
