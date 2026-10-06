import { describe, expect, it } from 'vitest'
import { ConnectionCounter, RateLimiter } from '../server/limits.ts'

describe('server abuse limits', () => {
  it('allows max hits per window, then blocks until the window resets', () => {
    const limiter = new RateLimiter(3, 1000)
    expect([1, 2, 3].map(() => limiter.take('ip', 0))).toEqual([true, true, true])
    expect(limiter.take('ip', 500)).toBe(false)
    expect(limiter.take('other-ip', 500)).toBe(true)
    expect(limiter.take('ip', 1000)).toBe(true)
  })

  it('caps concurrent connections per IP and frees slots on release', () => {
    const conns = new ConnectionCounter(2)
    expect(conns.acquire('a')).toBe(true)
    expect(conns.acquire('a')).toBe(true)
    expect(conns.acquire('a')).toBe(false)
    conns.release('a')
    expect(conns.acquire('a')).toBe(true)
  })
})
