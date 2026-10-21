export function isStrongPassword(value: string): boolean {
  return (
    value.length >= 8 &&
    value.length <= 128 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(value)
  )
}
