import { expect, test, vi } from "vitest";
import { _api } from "@iconify/vue";
import { disableIconRequests } from "../icons";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import tabler from "@iconify-json/tabler/icons.json";

test("every Nuxt UI default icon is a valid locally installed Tabler icon", () => {
  const config = readFileSync(resolve(import.meta.dirname, '../../vite.config.ts'), 'utf8');
  const mapping = config.match(/export const uiIcons = \{([\s\S]*?)\} as const/)![1]!;
  const names = [...mapping.matchAll(/"(i-tabler-[^"]+)"/g)].map(match => match[1]!);
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    expect(name.startsWith("i-tabler-")).toBe(true);
    expect(Object.hasOwn(tabler.icons, name.slice("i-tabler-".length))).toBe(true);
  }
});
test("remote icon fallback never calls network fetch", async () => {
  const spy = vi.spyOn(_api, "setFetch");
  const network = vi.spyOn(globalThis, "fetch");
  disableIconRequests();
  const handler = spy.mock.calls[0]![0];
  const result = await handler("https://api.iconify.design/tabler.json?icons=missing");
  expect(result.status).toBe(404);
  expect(network).not.toHaveBeenCalled();
  spy.mockRestore();
  network.mockRestore();
});
