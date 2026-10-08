import { test, expect } from "vitest";
import { ccmDirectoryName } from "../ccm-title";

test("CCM title removes forbidden characters and converts trimmed spaces", () => {
  expect(ccmDirectoryName('  中文 战役<>:"/\\|?*  ')).toBe("中文_战役");
  expect(ccmDirectoryName(" My  Campaign... ")).toBe("My__Campaign");
  expect(ccmDirectoryName("Hello\u0001World\u007f")).toBe("HelloWorld");
  expect(ccmDirectoryName("A\u3000B")).toBe("A_B");
});

test("invalid empty, reserved and oversized titles are rejected", () => {
  for (const title of [
    "   ",
    "<>:/\\",
    "...",
    "CON",
    "nul.txt",
    "COM1",
    "LPT².txt",
    "中".repeat(86),
  ]) {
    expect(() => ccmDirectoryName(title)).toThrow();
  }
});
