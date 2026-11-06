import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The server modules read their configuration on import: point them at a throwaway database first.
const dir = mkdtempSync(join(tmpdir(), 'war-room-auth-'))
process.env.DATA_DIR = dir
process.env.ADMIN_PASSWORD = 'correct horse'

let auth: typeof import('../server/auth.ts')
let db: typeof import('../server/db.ts')
beforeAll(async () => {
  auth = await import('../server/auth.ts')
  db = await import('../server/db.ts')
})
afterAll(() => {
  db.db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('room documents', () => {
  it('maps document names to a room and its part', () => {
    expect(auth.parseDocumentName('abcdef123')).toEqual({ room: 'abcdef123', part: 'plan' })
    expect(auth.parseDocumentName('abcdef123:lineup')).toEqual({ room: 'abcdef123', part: 'lineup' })
    expect(auth.parseDocumentName('abcdef123:other')).toBeNull()
    expect(auth.parseDocumentName('a:lineup:x')).toBeNull()
  })

  it('reads JSON credentials and bare passwords from older clients', () => {
    expect(auth.parseCredentials('{"pw":"x","owner":"o","admin":"a"}')).toEqual({ pw: 'x', owner: 'o', admin: 'a' })
    expect(auth.parseCredentials('secret')).toEqual({ pw: 'secret', owner: '', admin: '' })
    expect(auth.parseCredentials(undefined)).toEqual({ pw: '', owner: '', admin: '' })
  })
})

describe('admin sessions', () => {
  it('accepts only the configured password', () => {
    expect(auth.checkAdminPassword('correct horse')).toBe(true)
    expect(auth.checkAdminPassword('wrong')).toBe(false)
  })

  it('issues signed sessions that expire', () => {
    const { token, expires } = auth.createAdminSession(1_000)
    expect(auth.checkAdminSession(token, 2_000)).toBe(true)
    expect(auth.checkAdminSession(token, expires + 1)).toBe(false)
    expect(auth.checkAdminSession(token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), 2_000)).toBe(false)
    expect(auth.checkAdminSession(`${expires + 1e9}.${token.split('.')[1]}`, 2_000)).toBe(false) // extended expiry
  })
})

describe('room access', () => {
  it('lets members in with the password and organizers without it', () => {
    const owner = db.createRoom('room0001', 'Test', 'pw')
    const room = db.findRoom('room0001')!
    const none = { pw: '', owner: '', admin: '' }
    expect(auth.roomAccess(room, none)).toBe('denied')
    expect(auth.roomAccess(room, { ...none, pw: 'nope' })).toBe('denied')
    expect(auth.roomAccess(room, { ...none, pw: 'pw' })).toBe('member')
    expect(auth.roomAccess(room, { ...none, owner })).toBe('organizer')
    expect(auth.roomAccess(room, { ...none, admin: auth.createAdminSession().token })).toBe('organizer')
    expect(auth.roomAccess(room, { ...none, pw: 'pw', owner: 'forged' })).toBe('member')
  })

  it('treats everyone as a member of an open room', () => {
    db.createRoom('room0002', 'Open', '')
    expect(auth.roomAccess(db.findRoom('room0002')!, { pw: '', owner: '', admin: '' })).toBe('member')
  })

  it('summarises what is in a room for the room management', async () => {
    const Y = await import('yjs')
    const { roomContent, isEmpty } = await import('../server/roomStats.ts')
    db.createRoom('room0003', 'Used', '')
    db.createRoom('room0004', 'Never opened', '')
    const plan = new Y.Doc()
    plan.getMap('players').set('p1', { id: 'p1', name: 'Tyo' })
    plan.getMap('players').set('p2', { id: 'p2', name: 'Ann' })
    plan.getMap('assignments').set('12', { nation: 'GER', phaseId: null })
    plan.getMap('objects').set('o1', {})
    const lineup = new Y.Doc()
    lineup.getMap('slots').set('GER', { team: 'axis', player: 'p1' })
    db.storeDocument('room0003', Y.encodeStateAsUpdate(plan))
    db.storeDocument('room0003:lineup', Y.encodeStateAsUpdate(lineup))

    const used = roomContent('room0003', 1)
    expect(used).toMatchObject({ players: 2, seated: 1, planned: 1, drawings: 1, conquered: 0 })
    expect(used.bytes).toBeGreaterThan(0)
    expect(isEmpty(used)).toBe(false)
    expect(isEmpty(roomContent('room0004', 1))).toBe(true)
  })

  it('counts line-up changes as room activity', () => {
    db.createRoom('room0005', 'Old', '')
    // Created long ago and the plan untouched since, but the line-up was just edited.
    db.db.prepare('UPDATE rooms SET created_at = 0 WHERE id = ?').run('room0005')
    expect(db.staleRoomIds(30)).toContain('room0005')
    db.storeDocument('room0005:lineup', new Uint8Array([0, 0]))
    expect(db.staleRoomIds(30)).not.toContain('room0005')
    expect(db.listRooms().find((r) => r.id === 'room0005')!.updated_at).toBeGreaterThan(0)
  })

  it('deletes the line-up with its room', () => {
    db.storeDocument('room0002', new Uint8Array([1]))
    db.storeDocument('room0002:lineup', new Uint8Array([2]))
    db.deleteRoom('room0002')
    expect(db.loadDocument('room0002')).toBeNull()
    expect(db.loadDocument('room0002:lineup')).toBeNull()
  })
})
