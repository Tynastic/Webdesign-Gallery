/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

/** App version (package.json + git commit), injected at build time. */
declare const __APP_VERSION__: string
