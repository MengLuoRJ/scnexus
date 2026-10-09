export function redact(value: string): string {
  return value
    .replace(/scnexus:\/\/authentication\S*/gi, '[authentication link]')
    .replace(/(authorization[\s"':=]+)(?:bearer\s+)?[^\s,;}]+/gi, '$1[redacted]')
    .replace(/((?:access_token|refresh_token|password)[\s"':=]+)[^\s,;}]+/gi, '$1[redacted]')
}
