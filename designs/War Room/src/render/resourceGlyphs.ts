import type { Resource } from '../map/types'

/**
 * Resource glyphs, shared by the map canvas and the UI so both show the same
 * shapes: a wheat ear (food), an ingot (metal) and a drop (oil). Filled paths in
 * a 24×24 box, drawn with a paper halo like the map's other symbols.
 */
export const RESOURCE_GLYPHS: Record<Resource, { d: string; color: string }> = {
  food: {
    d:
      'M12 1.5Q17.2 5 12 8.5Q6.8 5 12 1.5Z' +
      'M11 12Q11.89 6.11 6 7Q5.11 12.89 11 12Z M13 12Q12.11 6.11 18 7Q18.89 12.89 13 12Z' +
      'M11 17Q11.89 11.11 6 12Q5.11 17.89 11 17Z M13 17Q12.11 11.11 18 12Q18.89 17.89 13 17Z' +
      'M11 8h2v14.5h-2z',
    color: '#8a5f05',
  },
  metal: { d: 'M7 6.5h10l5 11H2z', color: '#4f6176' },
  oil: { d: 'M12 1.5S4.5 10.1 4.5 15a7.5 7.5 0 0 0 15 0C19.5 10.1 12 1.5 12 1.5z', color: '#1f1d1a' },
}

export const RESOURCE_LIST: Resource[] = ['food', 'metal', 'oil']

export const GLYPH_HALO = 'rgba(250,246,234,0.95)'

/** Glyph size in screen px: bigger for more production. */
export const glyphSize = (amount: number) => (amount >= 3000 ? 14 : amount >= 1500 ? 12 : 10)

/** Inline SVG markup, for HTML built outside Vue (map tooltips). */
export function resourceSvg(res: Resource, size = 14): string {
  const g = RESOURCE_GLYPHS[res]
  return `<svg class="res-icon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${g.d}" fill="${g.color}" stroke="${GLYPH_HALO}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/></svg>`
}
