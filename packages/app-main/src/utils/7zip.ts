import { app } from "electron";
import * as node7z from "node-7z";
import bin from "7z-bin";

const binPath =
  app.isPackaged || process.env.NODE_ENV === "production"
    ? bin.path7z.replace("app.asar", "app.asar.unpacked")
    : bin.path7z;

export const szAdd = (
  archive: string,
  source: string | string[],
  options?: node7z.SevenZipOptions
) =>
  node7z.add(archive, source, {
    $bin: binPath,
    ...options,
  });

export const szDelete = (
  archive: string,
  target: string | string[],
  options?: node7z.SevenZipOptions
) =>
  node7z.delete(archive, target, {
    $bin: binPath,
    ...options,
  });

export const szExtract = (
  archive: string,
  output: string,
  options?: node7z.SevenZipOptions
) =>
  node7z.extract(archive, output, {
    $bin: binPath,
    ...options,
  });

export const szExtractFull = (
  archive: string,
  output: string,
  options?: node7z.SevenZipOptions
) =>
  node7z.extractFull(archive, output, {
    $bin: binPath,
    ...options,
  });

export const szHash = (target: string, options?: node7z.SevenZipOptions) =>
  node7z.hash(target, {
    $bin: binPath,
    ...options,
  });

export const szList = (archive: string, options?: node7z.SevenZipOptions) =>
  node7z.list(archive, {
    $bin: binPath,
    ...options,
  });

export const szRename = (archive: string, target: string[][]) =>
  node7z.rename(archive, target, {
    $bin: binPath,
  });
