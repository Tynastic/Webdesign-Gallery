import type { Team } from '../../shared/lineup'
import type { Category, NationClass } from '../../shared/points'
import type { CityKind, Resource } from '../map/types'
import { locale, t } from './index'

/** "1,5" / "1.5" in the UI language. */
export const fmtNum = (n: number) => n.toLocaleString(locale.value, { maximumFractionDigits: 1 })
/** "1,5 P." / "1.5 pts". */
export const fmtPoints = (n: number) => t('points.unit', { points: fmtNum(n) })
export const kindLabel = (k: CityKind) => t(`kind.${k}` as const)
export const resourceLabel = (r: Resource) => t(`res.${r}` as const)
export const categoryLabel = (c: Category) => t(`points.cat.${c}` as const)
/** "Class 2", or "AI" when the holder has no player (its land is free). */
export const classLabel = (c: NationClass | null) => (c ? t('points.class', { n: String(c) }) : t('points.aiHolder'))
/** "5 minutes ago" / "vor 5 Minuten" in the UI language. */
export function relativeTime(time: number, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  const minutes = Math.round((time - now) / 60000)
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  return Math.abs(hours) < 48 ? rtf.format(hours, 'hour') : rtf.format(Math.round(hours / 24), 'day')
}

/** "12 KB" / "1,4 MB". */
export function fmtBytes(n: number): string {
  const [v, unit] = n >= 1e6 ? [n / 1e6, 'MB'] : [n / 1e3, 'KB']
  return `${v.toLocaleString(locale.value, { maximumFractionDigits: v < 10 ? 1 : 0 })} ${unit}`
}

/** "Axis", "Allies", or "No team". */
export const teamLabel = (team: Team | null) => (team ? t(`team.${team}` as const) : t('team.none'))
