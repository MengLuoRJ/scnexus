import { app } from "electron";
import {
  SevenZipOptions,
  add,
  delete as delete_7z,
  extract,
  extractFull,
  hash,
  list,
  rename,
} from "node-7z";
import bin from "7z-bin";

const binPath =
  app.isPackaged || process.env.NODE_ENV === "production"
    ? bin.path7z.replace("app.asar", "app.asar.unpacked")
    : bin.path7z;

export const szAdd = (
  archive: string,
  source: string | string[],
  options?: SevenZipOptions
) =>
  add(archive, source, {
    $bin: binPath,
    ...options,
  });

export const szDelete = (
  archive: string,
  target: string | string[],
  options?: SevenZipOptions
) =>
  delete_7z(archive, target, {
    $bin: binPath,
    ...options,
  });

export const szExtract = (
  archive: string,
  output: string,
  options?: SevenZipOptions
) =>
  extract(archive, output, {
    $bin: binPath,
    ...options,
  });

export const szExtractFull = (
  archive: string,
  output: string,
  options?: SevenZipOptions
) =>
  extractFull(archive, output, {
    $bin: binPath,
    ...options,
  });

export const szHash = (target: string, options?: SevenZipOptions) =>
  hash(target, {
    $bin: binPath,
    ...options,
  });

export const szList = (archive: string, options?: SevenZipOptions) =>
  list(archive, {
    $bin: binPath,
    ...options,
  });

export const szRename = (archive: string, target: string[][]) =>
  rename(archive, target, {
    $bin: binPath,
  });
