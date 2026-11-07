import type L from 'leaflet'

/**
 * All stored geometry uses SVG pixel space (x right, y down). Leaflet's CRS.Simple
 * has lat pointing up, so a point (x, y) maps to latLng(-y, x).
 */
export type Point = [x: number, y: number]

export const toLatLng = (x: number, y: number): L.LatLngTuple => [-y, x]

export const toPoint = (ll: L.LatLng): Point => [ll.lng, -ll.lat]

export * from './wrap'
