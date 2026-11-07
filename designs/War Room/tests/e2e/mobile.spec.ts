import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { counts, joinAs, seat } from './helpers'

/**
 * Phones: real touch input (Chrome DevTools touch events, which also produce pointer
 * events, taps and long-presses like a phone does). Chromium only.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
test.skip(({ browserName }) => browserName !== 'chromium', 'touch events via CDP')

type Pt = { x: number; y: number }

class Finger {
  constructor(private readonly cdp: CDPSession) {}
  down(...pts: Pt[]) {
    return this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts.map((p, id) => ({ ...p, id })) })
  }
  move(...pts: Pt[]) {
    return this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts.map((p, id) => ({ ...p, id })) })
  }
  up() {
    return this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  async drag(from: Pt, dx: number, dy = 0, steps = 10) {
    await this.down(from)
    for (let i = 1; i <= steps; i++) await this.move({ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps })
    await this.up()
  }
  async tap(p: Pt) {
    await this.down(p)
    await this.up()
  }
}

/** Centre the map on a province (no animation) and return its screen position. */
async function showProvince(page: Page, name: string, zoom = 0): Promise<Pt> {
  return page.evaluate(
    ([name, zoom]) => {
      type Planner = { data: { provinces: { id: number; name: string }[] }; index: { centerOf(id: number): [number, number] }; map: import('leaflet').Map }
      const planner = (window as unknown as { __cow: { planner: Planner } }).__cow.planner
      const p = planner.data.provinces.find((pr) => pr.name === name)!
      const [x, y] = planner.index.centerOf(p.id)
      planner.map.setView([-y, x], zoom, { animate: false })
      const pt = planner.map.latLngToContainerPoint([-y, x])
      const box = planner.map.getContainer().getBoundingClientRect()
      return { x: Math.round(box.left + pt.x), y: Math.round(box.top + pt.y) }
    },
    [name, zoom] as const,
  )
}

const mapCenter = (page: Page) =>
  page.evaluate(() => {
    const c = (window as unknown as { __cow: { planner: { map: import('leaflet').Map } } }).__cow.planner.map.getCenter()
    return { lat: c.lat, lng: c.lng }
  })

async function openPlan(page: Page) {
  await page.goto('/local')
  await joinAs(page, 'Player', 'GER')
  return new Finger(await page.context().newCDPSession(page))
}

test('touch: one finger paints, a second finger turns the stroke into a pinch', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const finger = await openPlan(page)
  const warsaw = await showProvince(page, 'Warsaw')

  // Panning with one finger still works in the select tool.
  const before = await mapCenter(page)
  await finger.drag(warsaw, -120, 0)
  await page.waitForTimeout(300)
  expect((await mapCenter(page)).lng).toBeGreaterThan(before.lng)

  // A finger stroke plans several provinces.
  const start = await showProvince(page, 'Warsaw')
  await page.keyboard.press('p')
  await finger.drag(start, 140, 0, 14)
  expect((await counts(page)).planned).toBeGreaterThan(1)

  // A second finger landing mid-stroke reverts the stroke: it was the start of a pinch.
  await page.keyboard.press('Control+z')
  expect((await counts(page)).planned).toBe(0)
  const lublin = await showProvince(page, 'Lublin')
  await finger.down(lublin)
  await finger.move({ x: lublin.x + 4, y: lublin.y })
  expect((await counts(page)).planned).toBe(1) // the first finger has painted
  await finger.down(lublin, { x: lublin.x + 80, y: lublin.y + 80 })
  await finger.move({ x: lublin.x - 20, y: lublin.y - 20 }, { x: lublin.x + 120, y: lublin.y + 120 })
  await finger.up()
  expect((await counts(page)).planned).toBe(0)
  await page.waitForTimeout(600) // let the pinch's zoom animation settle

  // "Whole territory" replaces Shift+click: one tap conquers all of Poland.
  const poland = await showProvince(page, 'Warsaw')
  await page.keyboard.press('c')
  await page.locator('.tool-options [role=radio]', { hasText: 'Gebiet' }).click()
  await finger.tap(poland)
  expect((await counts(page)).owned).toBeGreaterThan(30)
  expect(errors).toEqual([])
})

test('touch: draw with Done and Undo point, long-press pings', async ({ page }) => {
  const finger = await openPlan(page)
  const p = await showProvince(page, 'Warsaw')

  await page.keyboard.press('a')
  const done = page.locator('.tool-options button', { hasText: 'Fertig' })
  await finger.tap(p)
  await page.waitForTimeout(400) // not a double-tap
  await expect(done).toBeDisabled()
  await finger.tap({ x: p.x + 100, y: p.y })
  await page.waitForTimeout(400)
  await finger.tap({ x: p.x + 100, y: p.y + 100 })
  await page.waitForTimeout(400)
  await page.locator('.tool-options button', { hasText: 'Punkt zurück' }).click()
  await done.click()
  expect((await counts(page)).objects).toBe(1)
  const points = await page.evaluate(() => {
    const { plan } = (window as unknown as { __cow: { plan: { objects: Map<string, { points: unknown[] }> } } }).__cow
    return [...plan.objects.values()][0].points.length
  })
  expect(points).toBe(2)
  await expect(done).toHaveCount(0)

  // Long-press on the map pings it in the select tool (touch has no Alt+click).
  await page.keyboard.press('v')
  await finger.down({ x: p.x - 80, y: p.y + 40 })
  await page.waitForTimeout(900)
  await finger.up()
  await expect(page.locator('.ping-marker')).toHaveCount(1)
})

test('phone layout: panels in a bottom sheet, rarely used sections folded', async ({ page }) => {
  const finger = await openPlan(page)
  const shell = page.locator('.shell')
  const handle = page.locator('.sheet-handle')
  const mapHeight = () => page.evaluate(() => (window as unknown as { __cow: { planner: { map: import('leaflet').Map } } }).__cow.planner.map.getSize().y)

  // Starts as just its bar, which carries the status hint in touch wording.
  await expect(shell).toHaveClass(/sheet-peek/)
  await expect(handle).toContainText('antippen')
  const tall = await mapHeight()

  // Tapping a province brings up its details; the map shrinks to the rest of the screen.
  await finger.tap(await showProvince(page, 'Warsaw'))
  await expect(shell).toHaveClass(/sheet-half/)
  await expect(page.locator('.sheet-body .province-name')).toContainText('Warsaw')
  await expect.poll(mapHeight).toBeLessThan(tall)

  // Swipe the bar up for the full sheet, tap it back down.
  const box = (await handle.boundingBox())!
  await finger.drag({ x: box.x + box.width / 2, y: box.y + 20 }, 0, -120, 6)
  await expect(shell).toHaveClass(/sheet-full/)
  await handle.tap()
  await expect(shell).toHaveClass(/sheet-half/)
  await handle.tap()
  await expect(shell).toHaveClass(/sheet-peek/)
  await expect.poll(mapHeight).toBe(tall)

  // Layers start folded (drawing tools show them); a viewer's own choice is remembered.
  await page.keyboard.press('a')
  const layers = page.locator('section[aria-labelledby="ph-layers"]')
  await expect(layers).toHaveClass(/closed/)
  await handle.tap()
  await layers.locator('.panel-toggle').tap()
  await expect(layers).not.toHaveClass(/closed/)
  await page.reload()
  await page.keyboard.press('a')
  await expect(page.locator('section[aria-labelledby="ph-layers"]')).not.toHaveClass(/closed/)

  // Nations: the "no team" group folds away as soon as teams are in use.
  await page.keyboard.press('v')
  await handle.tap()
  const noTeam = page.locator('.nation-group.team-none .nation-group-head')
  await expect(noTeam).toHaveAttribute('aria-expanded', 'true')
  await seat(page, 'FRA', 'Bob', { GER: 'axis', FRA: 'allies' })
  await expect(noTeam).toHaveAttribute('aria-expanded', 'false')
  await noTeam.tap()
  await expect(noTeam).toHaveAttribute('aria-expanded', 'true')
})
