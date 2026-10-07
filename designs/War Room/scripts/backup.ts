/**
 * Consistent online backup of the SQLite database (rooms, plans, feedback) while
 * the server keeps running: `VACUUM INTO` writes a compact copy. Keeps the newest
 * BACKUP_KEEP files (default 14) in $DATA_DIR/backups.
 *
 *   npm run backup                                  (local)
 *   docker compose exec app node scripts/backup.ts  (production, see DEPLOY.md)
 */
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const dataDir = resolve(process.env.DATA_DIR ?? join(import.meta.dirname, '..', 'server', 'data'))
const keep = Number(process.env.BACKUP_KEEP) || 14
const dir = join(dataDir, 'backups')
mkdirSync(dir, { recursive: true })

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const target = join(dir, `cow-planner-${stamp}.sqlite`)
const db = new DatabaseSync(join(dataDir, 'cow-planner.sqlite'))
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
db.close()
console.log(`backup written: ${target}`)

const old = readdirSync(dir).filter((f) => f.startsWith('cow-planner-') && f.endsWith('.sqlite')).sort().slice(0, -keep)
for (const f of old) rmSync(join(dir, f))
if (old.length) console.log(`removed ${old.length} old backup(s)`)
