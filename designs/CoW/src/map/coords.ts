import L from 'leaflet'

/**
 * All stored geometry uses SVG pixel space (x right, y down). Leaflet's CRS.Simple
 * has lat pointing up, so a point (x, y) maps to latLng(-y, x).
 */
export type Point = [x: number, y: number]

export const toLatLng = (x: number, y: number): L.LatLngTuple => [-y, x]

export const toPoint = (ll: L.LatLng): Point => [ll.lng, -ll.lat]

export function ringToLatLngs(ring: number[]): L.LatLngTuple[] {
  const out: L.LatLngTuple[] = new Array(ring.length / 2)
  for (let i = 0; i < ring.length; i += 2) out[i / 2] = [-ring[i + 1], ring[i]]
  return out
}

export function ringBounds(ring: number[]): L.LatLngBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i])
    minY = Math.min(minY, ring[i + 1]); maxY = Math.max(maxY, ring[i + 1])
  }
  return L.latLngBounds(toLatLng(minX, maxY), toLatLng(maxX, minY))
}

export * from './wrap'
