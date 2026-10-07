import L from 'leaflet'
import { t } from '../i18n'
import { escapeHtml } from '../render/icons'
import type { PingEvent, Presence } from '../sync/presence'
import { nearestCopy, toLatLng } from './coords'

const PING_MS = 2600

/**
 * Teammates' live cursors (arrow + name tag in their colour) and animated pings.
 * Positions arrive in canonical world coordinates and are shown on the world copy
 * nearest to this viewer's view, since the map wraps around.
 */
export class PresenceLayer {
  readonly group = L.layerGroup()
  private readonly cursors = new Map<number, L.Marker>()

  constructor(
    private readonly presence: Presence,
    private readonly map: L.Map,
    private readonly worldWidth: number,
  ) {
    presence.onChange(() => this.syncCursors())
    presence.onPing((p) => this.showPing(p))
    map.on('moveend', () => this.syncCursors())
  }

  private place(x: number, y: number) {
    return toLatLng(nearestCopy(x, this.map.getCenter().lng, this.worldWidth), y)
  }

  private syncCursors() {
    const alive = new Set<number>()
    for (const { clientId, state } of this.presence.peers()) {
      if (!state.cursor) continue
      alive.add(clientId)
      const ll = this.place(state.cursor[0], state.cursor[1])
      const key = `${state.user.name}|${state.user.color}`
      let m = this.cursors.get(clientId)
      if (!m || m.options.alt !== key) {
        if (m) this.group.removeLayer(m)
        m = L.marker(ll, {
          pane: 'cursors',
          interactive: false,
          keyboard: false,
          alt: key,
          icon: L.divIcon({
            className: 'peer-cursor',
            iconSize: undefined,
            html: `<svg viewBox="0 0 16 20" width="16" height="20" aria-hidden="true"><path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" fill="${state.user.color}" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg><span style="background:${state.user.color}">${escapeHtml(state.user.name)}</span>`,
          }),
        })
        this.group.addLayer(m)
        this.cursors.set(clientId, m)
      } else m.setLatLng(ll)
    }
    for (const [id, m] of this.cursors)
      if (!alive.has(id)) {
        this.group.removeLayer(m)
        this.cursors.delete(id)
      }
  }

  private showPing(p: PingEvent) {
    const m = L.marker(this.place(p.x, p.y), {
      pane: 'cursors',
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'ping-marker',
        iconSize: undefined,
        html: `<div class="ping" style="--c:${p.user.color}"><i></i><i></i><b>${escapeHtml(p.self ? t('nations.you') : p.user.name)}</b></div>`,
      }),
    })
    this.group.addLayer(m)
    setTimeout(() => this.group.removeLayer(m), PING_MS)
  }
}
