import { toCanvas } from 'html-to-image'

export interface LegendEntry {
  color: string
  label: string
}

const SKIP = ['leaflet-control-container', 'leaflet-tooltip-pane', 'leaflet-handles-pane']

/**
 * Renders the current map view (base map, markings, labels, drawings, markers)
 * to a PNG with a footer: app, plan title, date and a legend of the plan's
 * nations — ready to paste into the Call of War chat or Discord.
 */
export async function exportMapImage(mapEl: HTMLElement, footerText: string, legend: LegendEntry[]): Promise<Blob> {
  const ratio = Math.min(2, window.devicePixelRatio || 1) * 1.5
  const map = await toCanvas(mapEl, {
    pixelRatio: ratio,
    backgroundColor: '#0d1418',
    filter: (node) => !(node instanceof HTMLElement && SKIP.some((c) => node.classList.contains(c))),
  })

  const bar = Math.round(40 * ratio)
  const out = document.createElement('canvas')
  out.width = map.width
  out.height = map.height + bar
  const ctx = out.getContext('2d')!
  ctx.drawImage(map, 0, 0)

  // Footer: title on the left, nation legend on the right.
  ctx.fillStyle = '#1a1e16'
  ctx.fillRect(0, map.height, out.width, bar)
  ctx.fillStyle = '#d9b45a'
  ctx.fillRect(0, map.height, out.width, Math.max(1, ratio))
  const font = `600 ${Math.round(14 * ratio)}px "Segoe UI", system-ui, sans-serif`
  ctx.font = font
  ctx.textBaseline = 'middle'
  const mid = map.height + bar / 2
  ctx.fillStyle = '#ece7d6'
  ctx.fillText(footerText, 16 * ratio, mid)

  let x = out.width - 16 * ratio
  for (const entry of [...legend].reverse()) {
    const w = ctx.measureText(entry.label).width
    x -= w
    if (x < ctx.measureText(footerText).width + 48 * ratio) break
    ctx.fillStyle = '#c4bfab'
    ctx.fillText(entry.label, x, mid)
    x -= 18 * ratio
    ctx.fillStyle = entry.color
    ctx.beginPath()
    ctx.arc(x + 6 * ratio, mid, 6 * ratio, 0, Math.PI * 2)
    ctx.fill()
    x -= 18 * ratio
  }

  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'))
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
