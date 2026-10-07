/** In-memory abuse protection: fixed-window rate limits and concurrent connection caps per client IP. */
import type { IncomingMessage } from 'node:http'
import { config } from './config.ts'

/** Allows `max` hits per key within `windowMs`. IPs are only held in memory, never stored. */
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>()
  private readonly max: number
  private readonly windowMs: number

  // Plain fields, no parameter properties: the server runs on Node's type stripping (erasable syntax only).
  constructor(max: number, windowMs: number) {
    this.max = max
    this.windowMs = windowMs
  }

  /** Counts a hit; false when the key is over its limit. */
  take(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key)
    if (!entry || entry.reset <= now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs })
      this.sweep(now)
      return true
    }
    entry.count++
    return entry.count <= this.max
  }

  private sweep(now: number) {
    if (this.hits.size < 10_000) return
    for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k)
  }
}

export class ConnectionCounter {
  private open = new Map<string, number>()
  private readonly max: number

  constructor(max: number) {
    this.max = max
  }

  /** Registers a connection; false when the IP already has `max` open. */
  acquire(ip: string): boolean {
    const n = this.open.get(ip) ?? 0
    if (n >= this.max) return false
    this.open.set(ip, n + 1)
    return true
  }

  release(ip: string) {
    const n = (this.open.get(ip) ?? 1) - 1
    if (n <= 0) this.open.delete(ip)
    else this.open.set(ip, n)
  }
}

export function clientIp(req: IncomingMessage): string {
  if (config.trustProxy) {
    // Cloudflare Tunnel: every request arrives from the cloudflared container; the visitor is in this header.
    const cf = req.headers['cf-connecting-ip']
    if (typeof cf === 'string' && cf) return cf
    const fwd = req.headers['x-forwarded-for']
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
    if (first) return first
  }
  return req.socket.remoteAddress ?? 'unknown'
}

const HOUR = 3_600_000
export const limiters = {
  rooms: new RateLimiter(config.limits.roomsPerHour, HOUR),
  feedback: new RateLimiter(config.limits.feedbackPerHour, HOUR),
  errors: new RateLimiter(config.limits.errorsPerHour, HOUR),
  connections: new ConnectionCounter(config.limits.connectionsPerIp),
}
