import { describe, expect, it } from 'vitest'
import { canonicalPoints, copiesIn, nearestCopy, wrapX } from '../src/map/wrap'

const W = 13562

describe('horizontal wrap-around', () => {
  it('folds x into the canonical world', () => {
    expect(wrapX(100, W)).toBe(100)
    expect(wrapX(W + 100, W)).toBe(100)
    expect(wrapX(-100, W)).toBe(W - 100)
  })

  it('picks the copy nearest a reference (the short way across the Pacific)', () => {
    // Alaska (x≈500) seen from a view centred on Kamchatka (x≈13000) lies just east of the seam.
    expect(nearestCopy(500, 13000, W)).toBe(500 + W)
    expect(nearestCopy(13000, 500, W)).toBe(13000 - W)
    expect(nearestCopy(6000, 6500, W)).toBe(6000)
  })

  it('normalises shapes by their first point and keeps them continuous across the seam', () => {
    expect(canonicalPoints([[W + 13000, 5], [W + 13800, 6]], W)).toEqual([[13000, 5], [13800, 6]])
    expect(canonicalPoints([[-200, 1], [300, 2]], W)).toEqual([[W - 200, 1], [W + 300, 2]])
    const inside: [number, number][] = [[10, 1]]
    expect(canonicalPoints(inside, W)).toBe(inside)
  })

  it('lists the world copies a view range touches', () => {
    expect(copiesIn(100, 200, W)).toEqual([0])
    expect(copiesIn(-100, 200, W)).toEqual([-1, 0])
    expect(copiesIn(W - 10, W + 10, W)).toEqual([0, 1])
  })
})
