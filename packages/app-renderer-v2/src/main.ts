import { disableIconRequests } from './icons'
import './assets/main.css'

import { createApp, type Plugin } from 'vue'
import { createPinia } from 'pinia'

import ui from '@nuxt/ui/vue-plugin'

import { i18n } from './locales'
import App from './App.vue'
import router from './router'
import { installErrorReporting } from './utils/error-reporting'

disableIconRequests()
const app = createApp(App)
app.onUnmount(installErrorReporting(app))

app.use(createPinia())
app.use(i18n as unknown as Plugin)
app.use(router)
app.use(ui)

app.mount('#app')
