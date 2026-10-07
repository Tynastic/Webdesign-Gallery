import { ref, watchEffect } from 'vue'
import { de } from './de'
import { en, type Messages } from './en'

/**
 * Tiny typed i18n: German is the default, English the alternative. The active
 * locale is a Vue ref, so every t() call inside a template or computed re-runs
 * when the language changes; non-Vue code (tools, map tooltips) reads it on use.
 */
export type Locale = 'de' | 'en'
export type MessageKey = keyof Messages
export type Params = Record<string, string | number>

/** A translatable message stored as data (e.g. the status bar hint), rendered in the current language. */
export interface Message {
  key: MessageKey
  params?: Params
}

export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
]

const STORAGE_KEY = 'cow-planner.locale'
const dicts: Record<Locale, Messages> = { de, en }

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'de' || saved === 'en') return saved
  } catch {
    /* storage unavailable */
  }
  return 'de'
}

export const locale = ref<Locale>(initialLocale())

watchEffect(() => {
  if (typeof document !== 'undefined') document.documentElement.lang = locale.value
  try {
    localStorage.setItem(STORAGE_KEY, locale.value)
  } catch {
    /* storage unavailable */
  }
})

/**
 * Translate a key. `{name}` placeholders are filled from params; a message of
 * the form "one|many" picks a form by params.n.
 */
export function t(key: MessageKey, params?: Params): string {
  let msg: string = dicts[locale.value][key] ?? en[key] ?? key
  if (params && typeof params.n === 'number' && msg.includes('|')) {
    const [one, many] = msg.split('|')
    msg = params.n === 1 ? one : many
  }
  return params ? msg.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : msg
}

/** Render a stored Message. */
export const tm = (m: Message | null | undefined) => (m ? t(m.key, m.params) : '')
