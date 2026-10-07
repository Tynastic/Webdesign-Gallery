import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  addLayer,
  addNation,
  addObject,
  addPhase,
  assignProvinces,
  createPlan,
  ensureDefaults,
  exportPlan,
  importPlan,
  LOCAL_ORIGIN,
  phaseVisibility,
  removeLayer,
  removeNation,
  removePhase,
  setOwners,
} from '../shared/schema'

const base = { layerId: 'general', phaseId: null, author: 'p1', variant: 'attack', color: '#f00', label: '' }

function freshPlan() {
  const plan = createPlan()
  ensureDefaults(plan)
  return plan
}

describe('plan model', () => {
  it('creates a default layer and title once', () => {
    const plan = freshPlan()
    ensureDefaults(plan)
    expect([...plan.layers.keys()]).toEqual(['general'])
    expect(plan.meta.get('title')).toBe('Untitled plan')
  })

  it('gives roster nations distinct marker colours and optional nicknames', () => {
    const plan = freshPlan()
    addNation(plan, 'GER', '  Tyo ')
    addNation(plan, 'ITA')
    expect(plan.nations.get('GER')).toMatchObject({ id: 'GER', nickname: 'Tyo' })
    expect(plan.nations.get('ITA')!.nickname).toBe('')
    expect(plan.nations.get('GER')!.color).not.toBe(plan.nations.get('ITA')!.color)
  })

  it('does not duplicate a nation', () => {
    const plan = freshPlan()
    addNation(plan, 'GER', 'Tyo')
    addNation(plan, 'GER', 'Someone else')
    expect(plan.nations.get('GER')!.nickname).toBe('Tyo')
  })

  it('clears a removed nation’s planned conquests but keeps ownership', () => {
    const plan = freshPlan()
    addNation(plan, 'GER')
    addNation(plan, 'ITA')
    assignProvinces(plan, [1, 2], 'GER', null)
    assignProvinces(plan, [3], 'ITA', null)
    setOwners(plan, [{ province: 9, nation: 'GER', original: 'POL' }])
    removeNation(plan, 'GER')
    expect([...plan.assignments.keys()]).toEqual(['3'])
    expect(plan.ownership.get('9')).toBe('GER')
  })

  it('stores only provinces that changed hands', () => {
    const plan = freshPlan()
    setOwners(plan, [
      { province: 1, nation: 'GER', original: 'POL' },
      { province: 2, nation: 'POL', original: 'POL' },
    ])
    expect([...plan.ownership.entries()]).toEqual([['1', 'GER']])
    setOwners(plan, [{ province: 1, nation: null, original: 'POL' }])
    expect(plan.ownership.size).toBe(0)
  })

  it('erases assignments with nation = null', () => {
    const plan = freshPlan()
    const a = 'GER'
    assignProvinces(plan, [1, 2], a, null)
    assignProvinces(plan, [1], null, null)
    expect([...plan.assignments.keys()]).toEqual(['2'])
  })

  it('deletes a layer with its objects but never the last layer', () => {
    const plan = freshPlan()
    const l2 = addLayer(plan, 'Second')
    addObject(plan, { ...base, type: 'arrow', layerId: l2, points: [[0, 0], [10, 0]] })
    addObject(plan, { ...base, type: 'arrow', points: [[0, 0], [10, 0]] })
    removeLayer(plan, l2)
    expect(plan.objects.size).toBe(1)
    removeLayer(plan, 'general')
    expect(plan.layers.size).toBe(1)
  })

  it('makes items phase-independent when their phase is deleted', () => {
    const plan = freshPlan()
    const ph = addPhase(plan, 'Day 1')
    const id = addObject(plan, { ...base, type: 'arrow', phaseId: ph, points: [[0, 0], [10, 0]] })
    assignProvinces(plan, [7], 'GER', ph)
    removePhase(plan, ph)
    expect(plan.objects.get(id)!.phaseId).toBeNull()
    expect(plan.assignments.get('7')!.phaseId).toBeNull()
  })

  it('round-trips through export/import', () => {
    const plan = freshPlan()
    addNation(plan, 'GER', 'Tyo')
    addPhase(plan, 'Day 1')
    assignProvinces(plan, [5, 6], 'GER', null)
    setOwners(plan, [{ province: 7, nation: 'GER', original: 'POL' }])
    addObject(plan, { ...base, type: 'unit', variant: 'armor', points: [[100, 200]], count: 3 })
    const snap = JSON.parse(JSON.stringify(exportPlan(plan)))

    const other = freshPlan()
    addNation(other, 'USA', 'will be replaced')
    importPlan(other, snap)
    expect(exportPlan(other)).toMatchObject({ ...snap, exportedAt: expect.any(String) })
  })

  it('drops v1 player assignments on import and on load', () => {
    const plan = freshPlan()
    importPlan(plan, { app: 'cow-planner', version: 1, title: 'old', layers: [], phases: [], objects: [], assignments: { '1': { player: 'x' } } } as never)
    expect(plan.assignments.size).toBe(0)
    const legacy = createPlan()
    legacy.assignments.set('4', { player: 'x' } as never)
    ensureDefaults(legacy)
    expect(legacy.assignments.size).toBe(0)
  })

  it('rejects foreign files', () => {
    expect(() => importPlan(freshPlan(), { app: 'nope' } as never)).toThrow('not-a-plan')
  })

  it('undoes only local edits', () => {
    const plan = freshPlan()
    const undo = new Y.UndoManager([plan.objects], { trackedOrigins: new Set([LOCAL_ORIGIN]) })
    addObject(plan, { ...base, type: 'text', points: [[0, 0]] })
    plan.doc.transact(() => plan.objects.set('remote', { ...base, id: 'remote', type: 'text', points: [[1, 1]], createdAt: 0, locked: false }), 'remote-peer')
    undo.undo()
    expect([...plan.objects.keys()]).toEqual(['remote'])
  })
})

describe('phaseVisibility', () => {
  const order = ['a', 'b', 'c']
  it('shows everything when no phase is active', () => expect(phaseVisibility('c', null, order)).toBe('full'))
  it('shows phase-less items always', () => expect(phaseVisibility(null, 'a', order)).toBe('full'))
  it('fades earlier, shows current, hides later', () => {
    expect(phaseVisibility('a', 'b', order)).toBe('dim')
    expect(phaseVisibility('b', 'b', order)).toBe('full')
    expect(phaseVisibility('c', 'b', order)).toBe('hidden')
  })
})
