export const encodingModes = ['raw', 'string', 'text', 'debug'] as const
export type EncodingMode = (typeof encodingModes)[number]

export function encodeText(value: string, mode: EncodingMode): string {
  const escaped = Array.from(
    new TextEncoder().encode(value),
    (byte) => {
      if (byte === 34) return '\\"'
      if (byte === 92) return '\\\\'
      if (byte >= 32 && byte <= 126) return String.fromCharCode(byte)
      return `\\x${byte.toString(16).padStart(2, '0')}`
    },
  ).join('')
  if (mode === 'raw') return escaped
  const literal = `"${escaped}"`
  if (mode === 'string') return literal
  const text = `StringToText(${literal})`
  return mode === 'text' ? text : `TriggerDebugOutput(1, ${text}, true);`
}
