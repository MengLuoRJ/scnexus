/// <reference types="vite/client" />

declare module 'virtual:third-party-licenses' {
  const entries: {
    name: string
    version: string
    license: string
    text: string
    source: string
  }[]
  export default entries
}

declare module 'virtual:nuxt-ui-icons' {
  export function init(
    register: (name: string, data: import('@iconify/vue').IconifyIcon) => void,
  ): void
}
