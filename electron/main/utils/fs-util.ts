import { access, mkdir, rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export async function exists(path: string): Promise<boolean> {
  return await access(path)
    .then(() => true)
    .catch(() => false);
}

export async function mkdirIfNotExist(
  path: string,
  { recursive = true }: { recursive?: boolean } = {}
): Promise<void> {
  await access(path).catch(async () => {
    await mkdir(path, { recursive });
  });
}

export async function rmIfExist(
  path: string,
  { recursive = true }: { recursive?: boolean } = {}
): Promise<void> {
  await access(path)
    .then(async () => {
      await rm(path, { recursive });
    })
    .catch(() => {
      return;
    });
}

export async function countPath(
  path: string,
  exclude: string[] = []
): Promise<{ files_count: number; files_size: number }> {
  let size = 0;
  let count = 0;

  const files = await readdir(path, {
    encoding: "utf-8",
    recursive: true,
  });

  for (const file of files) {
    if (exclude.includes(file)) continue;
    const fileStat = await stat(join(path, file));
    count += 1;
    size += fileStat.size;
  }

  return { files_count: count, files_size: size };
}

export async function countPathCompatible(
  path: string,
  exclude: string[] = []
): Promise<{ files_count: number; files_size: number }> {
  let size = 0;
  let count = 0;

  const PathCounter = async (path: string) => {
    const files = await readdir(path, {
      encoding: "utf-8",
    });
    for (const file of files) {
      if (exclude.includes(file)) continue;
      const fileStat = await stat(join(path, file));
      if (fileStat.isDirectory()) {
        await PathCounter(join(path, file));
      } else {
        count += 1;
        size += fileStat.size;
      }
    }
  };

  await PathCounter(path);

  return { files_count: count, files_size: size };
}
