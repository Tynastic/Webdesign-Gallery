/** Shapes of the generated files in public/data (see scripts/build-map-data.ts). */

export interface Province {
  id: number
  name: string
  /** Index into MapData.colors: the province's original nation. */
  nation: number
  /** Label anchor in SVG pixels [x, y] (text baseline, roughly the centroid). */
  label: [number, number]
  /** Polygon area in square SVG pixels, used to rank labels. */
  area: number
  /** Ids of provinces sharing a border edge. */
  neighbors: number[]
  /** Flat ring in SVG pixels: [x0, y0, x1, y1, ...]. */
  ring: number[]
  /** The resource the province produces, if any. */
  res: Resource | null
  /** Daily production of that resource as in the game (non-core land already at 25%); 0 without one. */
  amount: number
  /** Core land of its original owner (colonies and other annexed land are not). */
  core: boolean
  /** 0 = province, 1 = city (3,000 home production), 2 = Doppelstadt (6,000). */
  city: CityKind
}

export type Resource = 'food' | 'metal' | 'oil'
export type CityKind = 0 | 1 | 2

/** A border polyline between provinces a < b (flat [x0, y0, x1, y1, ...]). */
export interface SharedBorder {
  a: number
  b: number
  line: number[]
}

export interface MapEdges {
  /** Coastline polylines (edges with a single owning province). */
  coast: number[][]
  /** Land borders; nation vs. province border is decided at runtime from current ownership. */
  shared: SharedBorder[]
}

export interface MapData {
  source: string
  hash: string
  width: number
  height: number
  ocean: string
  colors: string[]
  edges: MapEdges
  provinces: Province[]
}

export interface Nation {
  /** English name. */
  name: string
  /** German name (optional; falls back to the English name). */
  de?: string
  /** Short code, unique; used as the nation id in plans (e.g. "GER"). */
  short: string
  provinces: number
  /** Name of its capital's province (playable nations); checked by tests. */
  capital?: string
}

/** Keyed by fill colour, e.g. "rgb(168,71,65)". */
export type NationsFile = Record<string, Nation>
