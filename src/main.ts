import App from "./App.vue";
import router, { setupRouter } from "@/router";
import { createApp } from "vue";
import { createPinia } from "pinia";
import { createHead } from "@vueuse/head";
import { createPersistedState } from "pinia-plugin-persistedstate";
import * as Sentry from "@sentry/vue";
import "virtual:uno.css";
import "uno.css";

async function bootstrap() {
  const app = createApp(App);

  // setup pinia
  const pinia = createPinia();
  pinia.use(
    createPersistedState({
      key: (id) => `__pinia-presisted__${id}`,
    })
  );
  app.use(pinia);

  app.use(createHead());

  // setup router
  setupRouter(app);
  await router.isReady();

  if (import.meta.env.MODE === "production") {
    Sentry.init({
      app,
      dsn: import.meta.env.SENTRY_DSN,
      integrations: [
        new Sentry.BrowserTracing({
          // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
          tracePropagationTargets: [
            "localhost",
            // ...import.meta.env.SENTRY_TRACING_TARGETS?.split(", "),
          ],
          routingInstrumentation: Sentry.vueRouterInstrumentation(router),
        }),
        new Sentry.Replay(),
      ],
      // Performance Monitoring
      tracesSampleRate: 1.0, // Capture 100% of the transactions, reduce in production!
      // Session Replay
      replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
      replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
    });
  }

  // mount when the route is ready
  app.mount("#app").$nextTick(() => {
    postMessage({ payload: "removeLoading" }, "*");
  });
}

bootstrap();
