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
export const classLabel = (c: NationClass | null) => (c ? t('points.class', { n: String(c) }) : t('points.noClass'))
