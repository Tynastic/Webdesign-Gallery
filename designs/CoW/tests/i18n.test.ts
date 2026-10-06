import { describe, expect, it } from 'vitest'
import { de } from '../src/i18n/de'
import { en } from '../src/i18n/en'
import { locale, t } from '../src/i18n'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('i18n', () => {
  it('defaults to German', () => {
    expect(locale.value).toBe('de')
    expect(t('app.name')).toBe('War Room')
    expect(t('common.cancel')).toBe('Abbrechen')
  })

  it('has every key in both languages with the same placeholders and plural forms', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(de[key], key).toBeTruthy()
      expect(placeholders(de[key]), key).toEqual(placeholders(en[key]))
      expect(de[key].includes('|'), key).toBe(en[key].includes('|'))
    }
  })

  it('interpolates and picks plural forms', () => {
    locale.value = 'en'
    expect(t('layers.count', { n: 1 })).toBe('1 drawing')
    expect(t('layers.count', { n: 3 })).toBe('3 drawings')
    expect(t('join.as', { nation: 'Germany' })).toBe('Join as Germany')
    locale.value = 'de'
    expect(t('layers.count', { n: 3 })).toBe('3 Zeichnungen')
    expect(t('join.as', { nation: 'Deutschland' })).toBe('Als Deutschland beitreten')
  })
})
