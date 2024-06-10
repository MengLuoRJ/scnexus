import { app } from "electron";
import { join, basename } from "node:path";
import { readFile } from "node:fs/promises";
import { szExtract, szExtractFull, szList } from "./7zip";
import { Data } from "node-7z";
import { Logger } from "./logger";

const tempPath = join(app.getPath("temp"), ".scnexus", "operations");

export const szReadFile = async (
  archive: string,
  file_name: string
): Promise<Buffer> => {
  return new Promise<Buffer>((resolve, reject) => {
    szExtract(archive, tempPath, {
      $cherryPick: [`${file_name}`],
      recursive: true,
    })
      .on("end", async () => {
        const dataBuffer = await readFile(join(tempPath, file_name));
        resolve(dataBuffer);
      })
      .on("error", (e) => {
        Logger.error(e);
        reject(e);
      });
  });
};

export const szExtractFullPromisify = (archive: string, output: string) => {
  return new Promise<void>((resolve, reject) => {
    szExtractFull(archive, output, {
      recursive: true,
    })
      .on("end", async () => {
        resolve();
      })
      .on("error", (e) => {
        Logger.error(e);
        reject(e);
      });
  });
};

export const szListFull = async (archive: string): Promise<Data[]> => {
  return new Promise<Data[]>((resolve, reject) => {
    const list: Data[] = [];
    szList(archive, {
      charset: "UTF-8",
    })
      .on("data", (data) => {
        list.push(data);
      })
      .on("end", () => {
        resolve(list);
      })
      .on("error", (e) => {
        console.log(e);
        Logger.error(e);
        reject(e);
      });
  });
};
