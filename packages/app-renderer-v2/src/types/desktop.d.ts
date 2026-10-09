import type { DesktopApi } from '@scnexus/app-shared/types/desktop.type'

declare global {
  interface Window {
    scnexus?: DesktopApi
    webUtils?: { getPathForFile(file: File): string }
  }
}
export {}
