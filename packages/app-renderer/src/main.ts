import App from './App.vue'
import router, { setupRouter } from '@/router'
import { i18n } from '@/locales'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createHead } from '@unhead/vue'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import { init as sentryInit } from '@sentry/electron/renderer'
import * as vueSentry from '@sentry/vue'
import 'virtual:uno.css'
import 'uno.css'

async function bootstrap() {
  const app = createApp(App)

  const pinia = createPinia()
  pinia.use(
    createPersistedState({
      key: (id) => `__pinia-presisted__${id}`,
    }),
  )
  app.use(pinia)

  app.use(i18n)

  app.use(createHead())

  setupRouter(app)
  await router.isReady()

  if (import.meta.env.MODE === 'production') {
    sentryInit(
      {
        dsn: import.meta.env.VITE_SENTRY_DSN,
        integrations: [
          vueSentry.browserTracingIntegration({ router }),
          vueSentry.replayIntegration(),
        ],
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
      },
      vueSentry.init,
    )
  }

  app.mount('#app')
}

bootstrap()
