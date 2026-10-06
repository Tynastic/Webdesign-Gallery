import { expect, test } from '@playwright/test'
import { joinAs } from './helpers'

type Cow = { planner: { map: { setView(c: [number, number], z: number, o: object): void; getCenter(): { lng: number } } }; session: { hoveredProvince: number | null } }

test('the map wraps: pan from Asia across the Pacific to America', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/local')
  await joinAs(page, 'Tyo', 'JPN')
  await page.evaluate(() => (window as unknown as { __cow: Cow }).__cow.planner.map.setView([-1900, 12000], -2, { animate: false }))

  // Two drags to the east (dragging the map to the left), 600 px = 2400 map units each at this zoom.
  // Pausing before release avoids inertia, so the distance is deterministic.
  for (let i = 0; i < 2; i++) {
    await page.mouse.move(1000, 450)
    await page.mouse.down()
    for (let x = 1000; x >= 400; x -= 50) await page.mouse.move(x, 450)
    await page.waitForTimeout(250)
    await page.mouse.up()
    await page.waitForTimeout(300)
  }
  // 12000 + 4800 = 16800 lies past the date line; folded back into the world that is x ≈ 3238: North America.
  const lng = await page.evaluate(() => (window as unknown as { __cow: Cow }).__cow.planner.map.getCenter().lng)
  expect(lng).toBeGreaterThan(2800)
  expect(lng).toBeLessThan(3700)
  await page.mouse.move(588, 456)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __cow: Cow }).__cow.session.hoveredProvince)).not.toBeNull()
  expect(errors).toEqual([])
})
