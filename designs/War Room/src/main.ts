import { createApp } from 'vue'
import './style.css'
import { installErrorReporting } from './sync/telemetry'
import App from './ui/App.vue'

const app = createApp(App)
installErrorReporting(app)
app.mount('#app')
