/** Colour helpers shared by the map layers, the team palettes and the drawing renderer. */

/** The paper tone of the printed map: land with no fill, and what muted colours are pulled toward. */
export const PAPER = '#e9e1cc'

/** Mix two colours ("rgb(...)" or "#rrggbb"), t = share of b. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseColor(a)
  const [r2, g2, b2] = parseColor(b)
  const m = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`
}

function parseColor(c: string): [number, number, number] {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const [r, g, b] = c.match(/\d+/g)!.map(Number)
  return [r, g, b]
}
