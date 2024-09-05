/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface ImportMetaEnv {
  /**
   * Sentry DSN
   * @description Sentry DSN
   */
  readonly SENTRY_DSN: string;
  /**
   * Sentry Tracing Targets
   * @description Sentry Tracing Targets, split by `, `
   * @default ""
   * @example "api.example.com, example.com"
   */
  readonly SENTRY_TRACING_TARGETS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
