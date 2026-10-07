import { expect, test } from '@playwright/test'
import { counts, goToProvince, joinAs } from './helpers'

test('offline plan: paint, conquer, draw, undo and persist', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/local')
  await joinAs(page, 'Tyo', 'GER')
  await expect(page.locator('.nation-row')).toHaveCount(1)
  await goToProvince(page, 'Warsaw')

  // Plan a stroke of conquests for Germany.
  await page.keyboard.press('p')
  await page.mouse.move(520, 456)
  await page.mouse.down()
  for (let x = 520; x <= 660; x += 14) await page.mouse.move(x, 456)
  await page.mouse.up()
  expect((await counts(page)).planned).toBeGreaterThan(1)

  // Germany takes all of Poland (Shift+click = whole territory) -> planned ones count as taken.
  await page.keyboard.press('c')
  await page.keyboard.down('Shift')
  await page.mouse.click(588, 456)
  await page.keyboard.up('Shift')
  expect((await counts(page)).owned).toBeGreaterThan(30)
  await expect(page.locator('.nation-row .count-btn')).toHaveText(/^(\d+)\/\1$/)

  // Attack arrow, then undo/redo it.
  await page.keyboard.press('a')
  await page.mouse.click(420, 450)
  await page.mouse.dblclick(620, 440)
  expect((await counts(page)).objects).toBe(1)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+z')
  expect((await counts(page)).objects).toBe(0)
  await page.keyboard.press('Control+Shift+z')
  expect((await counts(page)).objects).toBe(1)

  // Everything survives a reload (IndexedDB), and I am still Germany.
  const before = await counts(page)
  await page.reload()
  await page.waitForSelector('.cow-canvas')
  await expect.poll(() => counts(page)).toEqual(before)
  await expect(page.locator('dialog.join[open]')).toHaveCount(0)
  expect(errors).toEqual([])
})
