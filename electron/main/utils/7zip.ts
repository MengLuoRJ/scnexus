import { app } from "electron";
import { SevenZipOptions, extract, extractFull } from "node-7z";
import bin from "7z-bin";

const binPath =
  app.isPackaged || process.env.NODE_ENV === "production"
    ? bin.path7z.replace("app.asar", "app.asar.unpacked")
    : bin.path7z;

export const szExtract = (
  source: string,
  target: string,
  options?: SevenZipOptions
) =>
  extract(source, target, {
    $bin: binPath,
    ...options,
  });

export const szExtractFull = (
  source: string,
  target: string,
  options?: SevenZipOptions
) =>
  extractFull(source, target, {
    $bin: binPath,
    ...options,
  });
