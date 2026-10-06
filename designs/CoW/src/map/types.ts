/** Shapes of the generated files in public/data (see scripts/build-map-data.ts). */

export interface Province {
  id: number
  name: string
  /** Index into MapData.colors: the province's 1942 starting nation. */
  nation: number
  /** Label anchor in SVG pixels [x, y] (text baseline, roughly the centroid). */
  label: [number, number]
  /** Polygon area in square SVG pixels, used to rank labels. */
  area: number
  /** Ids of provinces sharing a border edge. */
  neighbors: number[]
  /** Flat ring in SVG pixels: [x0, y0, x1, y1, ...]. */
  ring: number[]
}

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
}

/** Keyed by fill colour, e.g. "rgb(168,71,65)". */
export type NationsFile = Record<string, Nation>
