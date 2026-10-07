/**
 * Approximate real-world distances on the Call of War map.
 *
 * Fitting ~20 cities with known coordinates shows the SVG is close to a Mercator
 * projection (vertical and horizontal scale agree within 1%), but stylised (e.g.
 * Europe is enlarged), so distances are estimates. Mercator is conformal: the
 * local scale is the same in every direction and shrinks with cos(latitude).
 * A per-plan calibration factor corrects the estimate where the team measured
 * a known distance (e.g. from the game's travel display).
 */
import type { Point } from '../../shared/schema'

/** Map units per radian of longitude (fitted). */
const R_UNITS = 2250
/** y of the equator in map units (fitted). */
const Y_EQUATOR = 4236
const EARTH_RADIUS_KM = 6371

/** Latitude (radians) at a map y. */
export const latitudeAt = (y: number) => Math.atan(Math.sinh((Y_EQUATOR - y) / R_UNITS))

/** Kilometres per map unit at a map y (before calibration). */
export const kmPerUnitAt = (y: number) => (EARTH_RADIUS_KM / R_UNITS) * Math.cos(latitudeAt(y))

/** Length of a straight map segment in km, integrated over latitude. */
export function segmentKm(a: Point, b: Point): number {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (!len) return 0
  const steps = Math.max(1, Math.ceil(Math.abs(b[1] - a[1]) / 40))
  let km = 0
  for (let i = 0; i < steps; i++) km += (len / steps) * kmPerUnitAt(a[1] + ((b[1] - a[1]) * (i + 0.5)) / steps)
  return km
}

/** Length of a polyline in km, times the plan's calibration factor. */
export function pathKm(points: Point[], factor = 1): number {
  let km = 0
  for (let i = 1; i < points.length; i++) km += segmentKm(points[i - 1], points[i])
  return km * factor
}

/** Range circle: radius in km for a radius in map units at the centre, and back. */
export const radiusToKm = (radius: number, centerY: number, factor = 1) => radius * kmPerUnitAt(centerY) * factor
export const kmToRadius = (km: number, centerY: number, factor = 1) => km / (kmPerUnitAt(centerY) * factor)

/** "1.234 km" / "1,234 km" style, rounded sensibly. */
export function formatKm(km: number, locale: string): string {
  const rounded = km < 10 ? Math.round(km * 10) / 10 : km < 1000 ? Math.round(km) : Math.round(km / 10) * 10
  return `${rounded.toLocaleString(locale)} km`
}

/** Travel time for a distance at a speed: "5 h 30 min" / "2 d 4 h". */
export function formatDuration(km: number, kmh: number): string {
  const minutes = Math.round((km / kmh) * 60)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60), m = minutes % 60
  if (h < 48) return m ? `${h} h ${m} min` : `${h} h`
  const d = Math.floor(h / 24), rh = h % 24
  return rh ? `${d} d ${rh} h` : `${d} d`
}
