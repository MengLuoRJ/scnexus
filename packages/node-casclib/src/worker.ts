import { createRequire } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

interface NativeStorage {
  call(operation: string, args: unknown[]): unknown;
}

const port = parentPort;
if (!port) throw new Error("CascLib worker requires a parent port");
const require = createRequire(import.meta.url);
let storage: NativeStorage | undefined;

function report(id: number, error: unknown) {
  const failure = error as Error & { code?: number };
  port!.postMessage({
    id,
    error: {
      message: failure.message ?? String(error),
      name: failure.name ?? "Error",
      code: failure.code,
    },
  });
}

try {
  const binding = require("../build/Release/node_casclib.node") as {
    Storage: new (path: string, options: unknown) => NativeStorage;
  };
  storage = new binding.Storage(workerData.path, workerData.options);
  port.postMessage({ id: 0 });
} catch (error) {
  report(0, error);
  port.close();
}

if (storage) {
  port.on(
    "message",
    ({
      id,
      operation,
      args,
    }: {
      id: number;
      operation: string;
      args: unknown[];
    }) => {
      try {
        const value = storage!.call(operation, args);
        port.postMessage({ id, value });
        if (operation === "close") port.close();
      } catch (error) {
        report(id, error);
      }
    },
  );
}
