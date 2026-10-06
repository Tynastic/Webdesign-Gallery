/**
 * Converts world_map_political.svg into compact JSON for the client.
 *
 * The SVG has no ids: path[i] (province polygon) and text[i] (its city label)
 * are paired by document order. Each fill colour is one 1942 nation.
 *
 * Outputs:
 *   public/data/provinces.json  geometry + names (regenerated every run)
 *   public/data/nations.json    colour -> nation name (seeded once, then hand-edited)
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XMLParser } from 'fast-xml-parser'
import type { MapData, MapEdges, NationsFile, Province, SharedBorder } from '../src/map/types'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SVG_PATH = resolve(root, 'world_map_political.svg')
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
  Tehran: ['Iran', 'IRN'],
  Baghdad: ['Iraq', 'IRQ'],
  Kabul: ['Afghanistan', 'AFG'],
  'New Delhi': ['British India', 'IND'],
  Chongqing: ['China', 'CHN'],
  Canberra: ['Australia', 'AUS'],
  Pretoria: ['South Africa', 'RSA'],
  Riyadh: ['Saudi Arabia', 'SAU'],
  Bangkok: ['Thailand', 'THA'],
  Lima: ['Peru', 'PER'],
  Santiago: ['Chile', 'CHI'],
  Bogota: ['Colombia', 'COL'],
  Caracas: ['Venezuela', 'VEN'],
  Ulaanbaatar: ['Mongolia', 'MGL'],
  Lungnak: ['Tibet', 'TIB'],
  Tallinn: ['Estonia', 'EST'],
  Riga: ['Latvia', 'LAT'],
  Kaunas: ['Lithuania', 'LIT'],
  Danzig: ['Danzig', 'DAN'],
  Bratislava: ['Slovakia', 'SVK'],
  Luxemburg: ['Luxembourg', 'LUX'],
  Zenica: ['Yugoslavia', 'YUG'],
  Kucha: ['Sinkiang', 'SIN'],
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
  Lanzhou: ['Ma Clique', 'MAC'],
  Gisborne: ['New Zealand', 'NZL'],
  Kyzyl: ['Tannu Tuva', 'TAN'],
}

type XmlNode = Record<string, string>

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

    provinces.push({ id, name, nation: colorIndex.get(p.fill)!, label, area: Math.round(ringArea(ring)), neighbors: [], ring })
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
  console.log(`nations.json: ${added} added, ${Object.values(nations).filter((n) => n.short === '?').length} still unnamed`)
  if (mismatches.length) console.warn(`label outside its polygon (${mismatches.length}): ${mismatches.slice(0, 20).join(', ')}`)
  else console.log('label/polygon pairing: 0 mismatches')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
