import { locale } from '../i18n'
import type { MapData, NationsFile } from './types'

/**
 * One of the 72 nations on the 1942 map. `id` is its short code (e.g. "GER") and is
 * what plans store. `name` follows the UI language (and is reactive in Vue views).
 */
export class NationInfo {
  constructor(
    readonly index: number,
    readonly id: string,
    readonly color: string,
    readonly nameEn: string,
    readonly nameDe: string,
  ) {}

  get name(): string {
    return locale.value === 'de' ? this.nameDe : this.nameEn
  }
}

/** Lookup between nation index (in map data), nation id (short code) and display info. */
export class NationCatalog {
  readonly list: NationInfo[]
  readonly byId: Map<string, NationInfo>

  constructor(private readonly data: MapData, file: NationsFile) {
    this.list = data.colors.map((color, index) => {
      const entry = file[color]
      const en = entry?.name ?? `Nation ${index}`
      return new NationInfo(index, entry?.short ?? `N${index}`, color, en, entry?.de ?? en)
    })
    this.byId = new Map(this.list.map((n) => [n.id, n]))
  }

  /** Sorted by name in the current language, for pickers. */
  get sorted(): NationInfo[] {
    const lang = locale.value
    return [...this.list].sort((a, b) => a.name.localeCompare(b.name, lang))
  }

  /** The province's 1942 starting nation. */
  startOf(provinceId: number): NationInfo {
    return this.list[this.data.provinces[provinceId].nation]
  }

  /**
   * Current owner index for every province: the 1942 owner unless the plan's
   * ownership map says the province has been conquered by someone else.
   */
  owners(ownership: Iterable<[string, string]>): Int16Array {
    const owners = new Int16Array(this.data.provinces.length)
    this.data.provinces.forEach((p, i) => (owners[i] = p.nation))
    for (const [pid, nationId] of ownership) {
      const n = this.byId.get(nationId)
      const i = Number(pid)
      if (n && i >= 0 && i < owners.length) owners[i] = n.index
    }
    return owners
  }
}

/** Anchor for a nation name over one connected territory, in SVG pixels. */
export interface TerritoryLabel {
  nation: number
  x: number
  y: number
  /** Total territory area; larger territories get larger labels. */
  area: number
}

/**
 * One label per connected territory of each current owner (France proper and
 * French West Africa get separate labels; conquered land joins the conqueror).
 * The anchor is the area-weighted medoid province's label point, so it always
 * lies on land inside the territory.
 */
export function territoryLabels(data: MapData, owners: Int16Array): TerritoryLabel[] {
  const provinces = data.provinces
  const seen = new Uint8Array(provinces.length)
  const labels: TerritoryLabel[] = []
  for (const start of provinces) {
    if (seen[start.id]) continue
    const owner = owners[start.id]
    const group: number[] = []
    const stack = [start.id]
    seen[start.id] = 1
    while (stack.length) {
      const id = stack.pop()!
      group.push(id)
      for (const n of provinces[id].neighbors)
        if (!seen[n] && owners[n] === owner) {
          seen[n] = 1
          stack.push(n)
        }
    }
    let best = group[0], bestCost = Infinity
    for (const a of group) {
      const pa = provinces[a].label
      let cost = 0
      for (const b of group) cost += provinces[b].area * Math.hypot(pa[0] - provinces[b].label[0], pa[1] - provinces[b].label[1])
      if (cost < bestCost) [best, bestCost] = [a, cost]
    }
    const area = group.reduce((s, id) => s + provinces[id].area, 0)
    labels.push({ nation: owner, x: provinces[best].label[0], y: provinces[best].label[1] - 3, area })
  }
  return labels.sort((a, b) => b.area - a.area)
}

/** Connected provinces sharing the start province's current owner. */
export function connectedTerritory(data: MapData, owners: Int16Array, start: number): number[] {
  const owner = owners[start]
  const seen = new Set([start])
  const stack = [start]
  while (stack.length)
    for (const n of data.provinces[stack.pop()!].neighbors)
      if (!seen.has(n) && owners[n] === owner) {
        seen.add(n)
        stack.push(n)
      }
  return [...seen]
}
