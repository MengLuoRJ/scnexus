import { isAbsolute } from "node:path";
import { invalidData, isRecord } from "./store-repository";

export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) invalidData("Expected an object");
  return value;
}

export function keys(
  data: Record<string, unknown>,
  allowed: readonly string[],
) {
  if (Object.keys(data).some((key) => !allowed.includes(key)))
    invalidData("Unknown store field");
}

export function text(value: unknown) {
  if (typeof value !== "string" || value.includes("\0"))
    invalidData("Expected a string without NUL");
}

export function directory(value: unknown) {
  text(value);
  if (!isAbsolute(value as string))
    invalidData("Expected an absolute directory");
}

export function time(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    invalidData("Invalid timestamp");
}

export function bool(value: unknown) {
  if (typeof value !== "boolean") invalidData("Expected a boolean");
}
