/// <reference types="vite/client" />

declare module 'virtual:nuxt-ui-icons' {
  export function init(
    register: (name: string, data: import('@iconify/vue').IconifyIcon) => void,
  ): void
}
