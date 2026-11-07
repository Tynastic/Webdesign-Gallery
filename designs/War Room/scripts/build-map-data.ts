/**
 * Converts world_map_political.svg into compact JSON for the client.
 *
 * The SVG has no ids: path[i] (province polygon) and text[i] (its city label)
 * are paired by document order. Each fill colour is one original nation.
 *
 * sources/world_province_resources.csv (one row per province, matched by name
 * and label position) adds each province's resource production, from which core
 * land and city kind are derived (see classifyProvinces).
 *
 * Outputs:
 *   public/data/provinces.json  geometry + names + production (regenerated every run)
 *   public/data/nations.json    colour -> nation name (seeded once, then hand-edited)
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XMLParser } from 'fast-xml-parser'
import type { CityKind, MapData, MapEdges, NationsFile, Province, Resource, SharedBorder } from '../src/map/types'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SVG_PATH = resolve(root, 'sources/world_map_political.svg')
const RESOURCES_PATH = resolve(root, 'sources/world_province_resources.csv')
const PROVINCES_OUT = resolve(root, 'public/data/provinces.json')
const NATIONS_OUT = resolve(root, 'public/data/nations.json')

// Capital (or other unambiguous city) -> nation, used to seed nations.json.
const SEED_NATIONS: Record<string, [name: string, short: string]> = {
  Berlin: ['Germany', 'GER'],
  Paris: ['France', 'FRA'],
  London: ['United Kingdom', 'UK'],
  Moscow: ['Soviet Union', 'USSR'],
  Rome: ['Italy', 'ITA'],
  Tokyo: ['Japan', 'JPN'],
  Manila: ['United States', 'USA'],
  Madrid: ['Spain', 'ESP'],
  Lisbon: ['Portugal', 'POR'],
  Ankara: ['Turkey', 'TUR'],
  Warsaw: ['Poland', 'POL'],
  Budapest: ['Hungary', 'HUN'],
  Bucharest: ['Romania', 'ROM'],
  Sofia: ['Bulgaria', 'BUL'],
  Athens: ['Greece', 'GRE'],
  Stockholm: ['Sweden', 'SWE'],
  Oslo: ['Norway', 'NOR'],
  Helsinki: ['Finland', 'FIN'],
  Copenhagen: ['Denmark', 'DEN'],
  Bern: ['Switzerland', 'SUI'],
  Amsterdam: ['Netherlands', 'NED'],
  Brussels: ['Belgium', 'BEL'],
  Dublin: ['Ireland', 'IRL'],
  Ottawa: ['Canada', 'CAN'],
  'Mexico City': ['Mexico', 'MEX'],
  'Rio de Janeiro': ['Brazil', 'BRA'],
  'Buenos Aires': ['Argentina', 'ARG'],
  Cairo: ['Egypt', 'EGY'],
  Tehran: ['Persia', 'IRN'],
  Baghdad: ['Iraq', 'IRQ'],
  Kabul: ['Afghanistan', 'AFG'],
  'New Delhi': ['British India', 'IND'],
  Chongqing: ['Nationalist China', 'CHN'],
  Canberra: ['Australia', 'AUS'],
  Pretoria: ['South Africa', 'RSA'],
  Riyadh: ['Saudi Arabia', 'SAU'],
  Bangkok: ['Siam', 'THA'],
  Lima: ['Peru', 'PER'],
  Santiago: ['Chile', 'CHI'],
  Bogota: ['Colombia', 'COL'],
  Caracas: ['Venezuela', 'VEN'],
  Ulaanbaatar: ['Mongolia', 'MGL'],
  Lungnak: ['Tibet', 'TIB'],
  Tallinn: ['Estonia', 'EST'],
  Riga: ['Latvia', 'LAT'],
  Kaunas: ['Lithuania', 'LIT'],
  Danzig: ['Free City of Danzig', 'DAN'],
  Bratislava: ['Slovakia', 'SVK'],
  Luxemburg: ['Luxembourg', 'LUX'],
  Zenica: ['Yugoslavia', 'YUG'],
  Kucha: ['Xinjiang', 'SIN'],
  Guatemala: ['Guatemala', 'GUA'],
  Tegucigalpa: ['Honduras', 'HON'],
  'San Salvador': ['El Salvador', 'SAL'],
  Limon: ['Costa Rica', 'CRC'],
  Managua: ['Nicaragua', 'NIC'],
  Panamá: ['Panama', 'PAN'],
  Camagüey: ['Cuba', 'CUB'],
  'Santo Domingo': ['Dominican Republic', 'DOM'],
  'Port-au-Prince': ['Haiti', 'HAI'],
  Quito: ['Ecuador', 'ECU'],
  Potosí: ['Bolivia', 'BOL'],
  Montevideo: ['Uruguay', 'URU'],
  Asunción: ['Paraguay', 'PAR'],
  Monrovia: ['Liberia', 'LBR'],
  Qigihar: ['Manchukuo', 'MAN'],
  Hodeida: ['Yemen', 'YEM'],
  Muscat: ['Oman', 'OMA'],
  Kathmandu: ['Nepal', 'NEP'],
  Lanzhou: ['Communist China', 'MAC'],
  Gisborne: ['New Zealand', 'NZL'],
  Kyzyl: ['Tannu Tuva', 'TAN'],
}

type XmlNode = Record<string, string>

/** One row of world_province_resources.csv (the game's own province ids are not used). */
export interface ResourceRow {
  name: string
  x: number
  y: number
  specialty: Resource | null
  /** Production of the specialty resource (0 without one). */
  amount: number
  /** Only used to tell core land from non-core land; not part of the map data. */
  money: number
}

export function parseResources(csv: string): ResourceRow[] {
  const [head, ...lines] = csv.trim().split(/\r?\n/)
  const cols = head.split(',')
  return lines.map((line, i) => {
    const cells = line.split(',')
    if (cells.length !== cols.length) throw new Error(`world_province_resources.csv line ${i + 2}: expected ${cols.length} cells, got ${cells.length}`)
    const r = Object.fromEntries(cols.map((c, j) => [c, cells[j]]))
    return {
      name: r.name,
      x: Number(r.x),
      y: Number(r.y),
      specialty: (r.specialty || null) as Resource | null,
      amount: r.specialty ? Number(r[r.specialty]) : 0,
      money: Number(r.money),
    }
  })
}

export interface ClassifyInput {
  /** Original owner (colour index). */
  nation: number
  neighbors: number[]
  label: [number, number]
  /** Production of the specialty resource; null for provinces without one. */
  value: number | null
  money: number
}

/**
 * Core land and city kind, derived from production. Home provinces produce 600
 * money (no resource) or 750/1,500/3,000/6,000 of their resource; non-core land
 * produces a quarter: 150, or 187/375/750/1,500. So 750 and 1,500 are ambiguous
 * (a home province, or a colonial city / Doppelstadt). Those take the majority
 * status of their same-nation land neighbours; islands without any use the three
 * nearest same-nation provinces. The home-equivalent value then gives the kind:
 * 6,000 = Doppelstadt, 3,000 = city.
 */
export function classifyProvinces(items: ClassifyInput[], worldWidth: number): { core: boolean; city: CityKind }[] {
  const core = items.map(({ value, money }): boolean | null => (value === null ? money >= 600 : value >= 3000 ? true : value >= 750 ? null : false))
  const majority = (votes: boolean[]) => votes.filter(Boolean).length * 2 >= votes.length

  // Neighbour vote, one round at a time so the result doesn't depend on province order.
  for (let progress = true; progress; ) {
    progress = false
    const decided = items.map((it, i) => {
      if (core[i] !== null) return core[i]
      const votes = it.neighbors.filter((n) => items[n].nation === it.nation && core[n] !== null).map((n) => core[n]!)
      return votes.length ? majority(votes) : null
    })
    decided.forEach((c, i) => {
      if (c !== null && core[i] === null) {
        core[i] = c
        progress = true
      }
    })
  }

  const dist = (a: [number, number], b: [number, number]) => {
    const dx = Math.abs(a[0] - b[0]) % worldWidth
    return Math.hypot(Math.min(dx, worldWidth - dx), a[1] - b[1])
  }
  const resolved = core.map((c, i) => {
    if (c !== null) return c
    const nearest = items
      .map((it, j) => ({ j, d: dist(it.label, items[i].label) }))
      .filter(({ j }) => j !== i && items[j].nation === items[i].nation && core[j] !== null)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
    return nearest.length ? majority(nearest.map(({ j }) => core[j]!)) : true
  })

  return items.map((it, i) => {
    const home = (it.value ?? 0) * (resolved[i] ? 1 : 4)
    return { core: resolved[i], city: home >= 6000 ? 2 : home >= 3000 ? 1 : 0 }
  })
}

function parseRing(d: string): number[] {
  // Paths are single rings of absolute integer coordinates: "M x,y L x,y ... Z".
  const nums = d.match(/-?\d+(?:\.\d+)?/g)
  if (!nums || nums.length < 6 || nums.length % 2) throw new Error(`Unexpected path data: ${d.slice(0, 60)}`)
  return nums.map((n) => Math.round(Number(n)))
}

/** Signed-area-free shoelace area and point-in-polygon on a flat [x0,y0,x1,y1,...] ring. */
export function ringArea(r: number[]): number {
  let a = 0
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) a += (r[j] + r[i]) * (r[j + 1] - r[i + 1])
  return Math.abs(a / 2)
}

export function pointInRing(x: number, y: number, r: number[]): boolean {
  let inside = false
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Joins loose segments [ax, ay, bx, by] into as few flat polylines as possible. */
export function chainSegments(segments: number[][]): number[][] {
  const at = new Map<string, number[]>()
  const key = (x: number, y: number) => `${x},${y}`
  segments.forEach((s, i) => {
    for (const k of [key(s[0], s[1]), key(s[2], s[3])]) {
      const list = at.get(k)
      if (list) list.push(i)
      else at.set(k, [i])
    }
  })
  const used = new Uint8Array(segments.length)
  const take = (x: number, y: number): [number, number] | null => {
    for (const i of at.get(key(x, y)) ?? []) {
      if (used[i]) continue
      used[i] = 1
      const s = segments[i]
      return s[0] === x && s[1] === y ? [s[2], s[3]] : [s[0], s[1]]
    }
    return null
  }
  const lines: number[][] = []
  segments.forEach((s, i) => {
    if (used[i]) return
    used[i] = 1
    const pts = [s[0], s[1], s[2], s[3]]
    for (let next = take(pts[pts.length - 2], pts[pts.length - 1]); next; next = take(pts[pts.length - 2], pts[pts.length - 1])) pts.push(...next)
    for (let prev = take(pts[0], pts[1]); prev; prev = take(pts[0], pts[1])) pts.unshift(...prev)
    lines.push(pts)
  })
  return lines
}

function main() {
  const raw = readFileSync(SVG_PATH, 'utf8').replace(/<metadata>[\s\S]*?<\/metadata>/, '')
  const svg = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', textNodeName: '#text', htmlEntities: true }).parse(raw).svg

  const [, , width, height] = String(svg.viewBox).split(/\s+/).map(Number)
  const paths: XmlNode[] = svg.path
  const texts: XmlNode[] = svg.text
  if (paths.length !== texts.length) throw new Error(`path/text count mismatch: ${paths.length} vs ${texts.length}`)

  const colors: string[] = []
  const colorIndex = new Map<string, number>()
  const provinces: Province[] = []
  const mismatches: string[] = []

  paths.forEach((p, id) => {
    const t = texts[id]
    const name = String(t['#text']).trim()
    const label: [number, number] = [Math.round(Number(t.x)), Math.round(Number(t.y))]
    const ring = parseRing(p.d)

    if (!colorIndex.has(p.fill)) {
      colorIndex.set(p.fill, colors.length)
      colors.push(p.fill)
    }
    if (!pointInRing(label[0], label[1] - 3, ring)) mismatches.push(`#${id} ${name}`)

    provinces.push({ id, name, nation: colorIndex.get(p.fill)!, label, area: Math.round(ringArea(ring)), neighbors: [], ring, res: null, amount: 0, core: true, city: 0 })
  })

  // Adjacent provinces share at least one identical border edge (the SVG reuses exact vertices).
  const edgeOwners = new Map<string, number[]>()
  for (const p of provinces) {
    const r = p.ring
    for (let i = 0; i < r.length; i += 2) {
      const j = (i + 2) % r.length
      const a = `${r[i]},${r[i + 1]}`, b = `${r[j]},${r[j + 1]}`
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      const owners = edgeOwners.get(key)
      if (owners) owners.push(p.id)
      else edgeOwners.set(key, [p.id])
    }
  }
  const neighbors = provinces.map(() => new Set<number>())
  for (const owners of edgeOwners.values())
    for (const a of owners) for (const b of owners) if (a !== b) neighbors[a].add(b)
  provinces.forEach((p) => (p.neighbors = [...neighbors[p.id]].sort((a, b) => a - b)))

  // Production: rows are matched by name and must sit exactly on the province's label.
  const rows = new Map<string, ResourceRow>()
  const money: number[] = []
  for (const r of parseResources(readFileSync(RESOURCES_PATH, 'utf8'))) {
    if (rows.has(r.name)) throw new Error(`world_province_resources.csv: duplicate province ${r.name}`)
    rows.set(r.name, r)
  }
  for (const p of provinces) {
    const r = rows.get(p.name)
    if (!r) throw new Error(`world_province_resources.csv: no row for #${p.id} ${p.name}`)
    if (Math.round(r.x) !== p.label[0] || Math.round(r.y) !== p.label[1]) throw new Error(`world_province_resources.csv: ${p.name} is at ${r.x},${r.y}, the map label at ${p.label}`)
    p.res = r.specialty
    p.amount = r.amount
    money[p.id] = r.money
    rows.delete(p.name)
  }
  if (rows.size) throw new Error(`world_province_resources.csv: rows without a province: ${[...rows.keys()].slice(0, 10).join(', ')}`)
  const kinds = classifyProvinces(
    provinces.map((p) => ({ nation: p.nation, neighbors: p.neighbors, label: p.label, value: p.res ? p.amount : null, money: money[p.id] })),
    width,
  )
  provinces.forEach((p, i) => Object.assign(p, kinds[i]))

  // Coastlines have one owner. Every other edge is grouped by the province pair it separates, so the
  // client can decide at runtime (from current ownership) whether it is a nation or a province border.
  const coastSegs: number[][] = []
  const byPair = new Map<string, number[][]>()
  for (const [key, owners] of edgeOwners) {
    const seg = key.split(/[|,]/).map(Number)
    if (owners.length === 1) {
      coastSegs.push(seg)
      continue
    }
    const [a, b] = [owners[0], owners[1]].sort((x, y) => x - y)
    const pair = `${a}-${b}`
    const list = byPair.get(pair)
    if (list) list.push(seg)
    else byPair.set(pair, [seg])
  }
  const shared: SharedBorder[] = []
  for (const [pair, segs] of byPair) {
    const [a, b] = pair.split('-').map(Number)
    for (const line of chainSegments(segs)) shared.push({ a, b, line })
  }
  const edges: MapEdges = { coast: chainSegments(coastSegs), shared }

  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16)
  const data: MapData = { source: 'world_map_political.svg', hash, width, height, ocean: svg.rect.fill, colors, edges, provinces }
  writeFileSync(PROVINCES_OUT, JSON.stringify(data))

  // Seed nations.json once; afterwards it is hand-curated, so only add missing colours.
  const nations: NationsFile = existsSync(NATIONS_OUT) ? JSON.parse(readFileSync(NATIONS_OUT, 'utf8')) : {}
  const seeded = new Map<string, [string, string]>()
  for (const [city, nation] of Object.entries(SEED_NATIONS)) {
    const p = provinces.find((pr) => pr.name === city)
    if (p) seeded.set(colors[p.nation], nation)
  }
  let added = 0
  for (const color of colors) {
    if (nations[color]) continue
    const count = provinces.filter((p) => colors[p.nation] === color).length
    const largest = provinces.filter((p) => colors[p.nation] === color).sort((a, b) => b.area - a.area)[0]
    const [name, short] = seeded.get(color) ?? [`Unknown (${largest.name})`, '?']
    nations[color] = { name, short, provinces: count }
    added++
  }
  writeFileSync(NATIONS_OUT, JSON.stringify(nations, null, 2) + '\n')

  const kb = (readFileSync(PROVINCES_OUT).length / 1024).toFixed(0)
  const isolated = provinces.filter((p) => !p.neighbors.length).length
  console.log(`provinces: ${provinces.length}  nations: ${colors.length}  size: ${kb} KB  hash: ${hash}`)
  console.log(`adjacency: ${isolated} provinces without land neighbours (islands)`)
  console.log(`edges: ${edges.coast.length} coast polylines, ${edges.shared.length} shared border polylines`)
  const count = (f: (p: Province) => boolean) => provinces.filter(f).length
  console.log(`production: ${count((p) => p.city === 2)} Doppelstädte, ${count((p) => p.city === 1)} cities, ${count((p) => !p.core)} non-core provinces`)
  console.log(`nations.json: ${added} added, ${Object.values(nations).filter((n) => n.short === '?').length} still unnamed`)
  if (mismatches.length) console.warn(`label outside its polygon (${mismatches.length}): ${mismatches.slice(0, 20).join(', ')}`)
  else console.log('label/polygon pairing: 0 mismatches')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
