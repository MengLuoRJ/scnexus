import { createHash } from "node:crypto";
import { pipeline, Transform } from "node:stream";
import { createReadStream } from "node:fs";
import { promisify } from "node:util";
import { createMD5 } from "hash-wasm";

export async function getFileMd5(path: string): Promise<string> {
  const stream = createReadStream(path);
  const hash = createHash("md5");

  await promisify(pipeline)(stream, hash);

  const data = hash.digest("hex");
  return Buffer.from(data, "hex").toString("base64");
}

export async function getFileMd5Wasm(path: string): Promise<string> {
  const stream = createReadStream(path);
  const md5 = await createMD5();
  md5.init();

  const transformStream = new Transform({
    transform(chunk, encoding, callback) {
      md5.update(chunk);
      callback();
    },
  });

  await promisify(pipeline)(stream, transformStream);

  const data = md5.digest("hex");
  return Buffer.from(data, "hex").toString("base64");
}
