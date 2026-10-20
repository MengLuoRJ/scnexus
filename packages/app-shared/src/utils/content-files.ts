export function resourcePath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const components = normalized.split('/')
  const index = components.findIndex((component) => /\.sc2(?:map|mod)$/i.test(component))
  return index === -1 ? normalized : components.slice(0, index + 1).join('/')
}

export function countRecognizedFiles(files: readonly { target: string }[]): number {
  return new Set(files.map((file) => resourcePath(file.target).toLowerCase())).size
}
