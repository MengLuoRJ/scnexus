const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB'] as const

export function formatFileSize(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  return `${unit === 0 ? value : Number(value.toFixed(2))} ${units[unit]}`
}
