import type { App } from 'vue'
import { t } from '../i18n'
import { toast } from '../state/feedback'

/**
 * Crash reports for the test phase: uncaught errors are sent (once per message,
 * at most a few per session) to /api/client-errors. No personal data beyond the
 * browser's user agent; room ids are stripped from the path.
 */
const sent = new Set<string>()
const MAX_REPORTS = 5

export function reportError(err: unknown) {
  const e = err instanceof Error ? err : new Error(String(err))
  const key = e.message.slice(0, 200)
  if (sent.has(key) || sent.size >= MAX_REPORTS) return
  sent.add(key)
  const body = JSON.stringify({
    message: e.message,
    stack: e.stack ?? '',
    path: location.pathname.replace(/^\/r\/.*/, '/r/…'),
    appVersion: __APP_VERSION__,
  })
  // keepalive lets the report survive a reload right after the error.
  fetch('/api/client-errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
}

export function installErrorReporting(app: App) {
  app.config.errorHandler = (err) => {
    console.error(err)
    toast(t('error.crash'))
    if (import.meta.env.PROD) reportError(err)
  }
  if (!import.meta.env.PROD) return
  window.addEventListener('error', (e) => reportError(e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason))
}
