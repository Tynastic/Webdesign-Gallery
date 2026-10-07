import type { ObjectiveIcon, UnitType } from '../../shared/schema'
import { t } from '../i18n'

const INK = '#1b1509'

/** Simplified NATO-style unit symbols: frame in player colour, type symbol in ink. */
const UNIT_SYMBOLS: Record<UnitType, string> = {
  infantry: `<path d="M2 2L34 22M34 2L2 22" stroke="${INK}" stroke-width="1.8"/>`,
  armor: `<rect x="8" y="6.5" width="20" height="11" rx="5.5" fill="none" stroke="${INK}" stroke-width="2"/>`,
  artillery: `<circle cx="18" cy="12" r="4" fill="${INK}"/>`,
  antiair: `<path d="M6 20Q18 0 30 20" fill="none" stroke="${INK}" stroke-width="2"/>`,
  air: `<path d="M8 12c3-6 7-6 10 0s7 6 10 0c-3-6-7-6-10 0s-7 6-10 0z" fill="none" stroke="${INK}" stroke-width="1.8"/>`,
  naval: `<path d="M18 5v14M14 8.5h8M11 14c0 4 3 6 7 6s7-2 7-6" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`,
  mixed: `<path d="M2 2L34 22M34 2L2 22" stroke="${INK}" stroke-width="1.5"/><rect x="9" y="7" width="18" height="10" rx="5" fill="none" stroke="${INK}" stroke-width="1.8"/>`,
}

export const UNIT_TYPES: UnitType[] = ['infantry', 'armor', 'artillery', 'antiair', 'air', 'naval', 'mixed']
export const unitLabel = (u: UnitType) => t(`unit.${u}`)

export function unitSvg(type: UnitType, color: string): string {
  return `<svg class="unit-frame" viewBox="0 0 36 24" width="36" height="24" aria-hidden="true">
    <rect x="1" y="1" width="34" height="22" rx="2" fill="${color}" stroke="${INK}" stroke-width="1.6"/>
    ${UNIT_SYMBOLS[type] ?? UNIT_SYMBOLS.infantry}</svg>`
}

const OBJECTIVE_PATHS: Record<ObjectiveIcon, string> = {
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/>',
  flag: '<path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/>',
  warning: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.5"/>',
}

export const OBJECTIVE_ICONS: ObjectiveIcon[] = ['target', 'flag', 'star', 'shield', 'warning']
export const objectiveLabel = (o: ObjectiveIcon) => t(`objective.${o}`)

export function objectiveSvg(icon: ObjectiveIcon, color: string): string {
  return `<svg class="obj-badge" viewBox="0 0 34 34" width="34" height="34" aria-hidden="true">
    <circle cx="17" cy="17" r="15.5" fill="${color}" stroke="${INK}" stroke-width="1.6"/>
    <g transform="translate(5 5)" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
      ${OBJECTIVE_PATHS[icon] ?? OBJECTIVE_PATHS.target}</g></svg>`
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
