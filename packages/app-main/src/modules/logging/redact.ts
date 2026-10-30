export function redact(value: string): string {
  return value
    .replace(/(["']?recoveryCodes["']?\s*[:=]\s*)\[[\s\S]*?\]/gi, '$1[redacted]')
    .replace(/\botpauth:\/\/[^\s"'<>]+/gi, '[authenticator URI]')
    .replace(/scnexus:\/\/authentication\S*/gi, '[authentication link]')
    .replace(/\bBearer\s+[^\s,;"'}]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/[A-Z]:[\\/]+Users[\\/]+[^\\/\s"']+/gi, '[user-home]')
    .replace(/\/(?:Users|home)\/[^/\s"']+/g, '[user-home]')
    .replace(/(authorization[\s"':=]+)(?:bearer\s+)?[^\s,;}]+/gi, '$1[redacted]')
    .replace(
      /((?:access_token|refresh_token|accessToken|refreshToken|password|newPassword|proof|code|recoveryCode|secret|otpauthUri)[\s"':=]+)[^\s,;}&]+/gi,
      '$1[redacted]',
    )
}
