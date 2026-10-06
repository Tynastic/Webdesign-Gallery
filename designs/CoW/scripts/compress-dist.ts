/**
 * Precompresses the built client (dist/) with Brotli and gzip so the server can
 * send `.br`/`.gz` variants without compressing on every request. The map data
 * (provinces.json, ~2.3 MB) shrinks to roughly a quarter.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const dist = join(import.meta.dirname, '..', 'dist')
const EXTENSIONS = new Set(['.js', '.css', '.html', '.json', '.svg', '.txt', '.webmanifest'])

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else yield path
  }
}

let before = 0, after = 0
for (const file of files(dist)) {
  if (!EXTENSIONS.has(extname(file))) continue
  const raw = readFileSync(file)
  if (raw.length < 1024) continue
  const br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length } })
  writeFileSync(`${file}.br`, br)
  writeFileSync(`${file}.gz`, gzipSync(raw, { level: 9 }))
  before += raw.length
  after += br.length
  if (raw.length > 100_000) console.log(`  ${relative(dist, file)}: ${(raw.length / 1024).toFixed(0)} KB → ${(br.length / 1024).toFixed(0)} KB br`)
}
console.log(`compressed dist: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB (brotli)`)
