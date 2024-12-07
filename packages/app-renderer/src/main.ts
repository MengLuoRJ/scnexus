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

  // setup pinia
  const pinia = createPinia()
  pinia.use(
    createPersistedState({
      key: (id) => `__pinia-presisted__${id}`,
    }),
  )
  app.use(pinia)

  // setup vue-i18n
  app.use(i18n)

  app.use(createHead())

  // setup router
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
        // Performance Monitoring
        tracesSampleRate: 0.1,
        // Session Replay
        replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
        replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
      },
      vueSentry.init,
    )
  }

  // mount when the route is ready
  app.mount('#app')
}

bootstrap()
