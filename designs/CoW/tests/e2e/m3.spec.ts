import { expect, test, type Browser, type Page } from '@playwright/test'
import { goToProvince, joinAs } from './helpers'

type Cow = { planner: { map: { setView(c: [number, number], z: number, o: object): void; getCenter(): { lat: number; lng: number } } } }
const center = (p: Page) => p.evaluate(() => (window as unknown as { __cow: Cow }).__cow.planner.map.getCenter())

async function createRoom(browser: Browser, nickname: string, nation: string) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 860 } })).newPage()
  await page.goto('/')
  await page.fill('.lobby-card input[maxlength="80"]', 'M3 test')
  await page.click('.lobby-card button[type=submit]')
  await page.waitForURL(/\/r\//)
  await joinAs(page, nickname, nation)
  return page
}

test('measure distances with travel time and calibrate them', async ({ page }) => {
  await page.goto('/local')
  await joinAs(page, 'Tyo', 'GER')
  await goToProvince(page, 'Warsaw')
  await page.keyboard.press('m')
  await page.mouse.click(450, 450)
  await page.mouse.dblclick(750, 450)
  await expect(page.locator('.measure-label')).toContainText('km')
  await expect(page.locator('.statusbar')).toContainText('Gemessen')

  await page.fill('.tool-options .to-field input', '20')
  await expect(page.locator('.measure-label')).toContainText(' h')

  await page.click('.tool-options button:has-text("Kalibrieren")')
  await page.fill('.tool-options .to-field input >> nth=1', '1000')
  await page.click('.tool-options button:has-text("Übernehmen")')
  await expect(page.locator('.tool-options')).toContainText('Kalibriert ×')
  await expect(page.locator('.measure-label')).toContainText('1.000 km')
})

test('follow a teammate, then the owner deletes the room for everyone', async ({ browser }) => {
  const a = await createRoom(browser, 'Tyo', 'GER')
  const b = await (await browser.newContext({ viewport: { width: 1440, height: 860 } })).newPage()
  await b.goto(a.url())
  await joinAs(b, 'Max', 'ITA')

  // B follows A; A jumps to Japan, B's view comes along.
  await b.locator('.presence .avatar').first().click()
  await expect(b.locator('.follow-banner')).toContainText('Tyo')
  await a.evaluate(() => (window as unknown as { __cow: Cow }).__cow.planner.map.setView([-2500, 12000], -1, { animate: false }))
  await expect.poll(async () => Math.round((await center(b)).lng)).toBe(12000)
  // Panning by hand hands control back.
  await b.mouse.move(600, 450)
  await b.mouse.down()
  await b.mouse.move(500, 450, { steps: 5 })
  await b.mouse.up()
  await expect(b.locator('.follow-banner')).toHaveCount(0)

  // Only the creator sees "Delete room"; deleting kicks everyone out.
  await expect(b.locator('.panel button:has-text("Raum löschen")')).toHaveCount(0)
  await a.click('.panel button:has-text("Raum löschen")')
  await a.click('dialog.confirm .btn.danger')
  await a.waitForURL((url) => url.pathname === '/')
  await expect(b.locator('.gone-overlay')).toBeVisible({ timeout: 15_000 })
})

test('testers can send feedback and read the legal pages', async ({ page }) => {
  await page.goto('/')
  await page.click('.lobby-foot .link-btn')
  await page.fill('dialog.feedback textarea', 'E2E: Die Karte ist super, aber das Messen fehlt mir auf dem Handy.')
  await page.click('dialog.feedback button[type=submit]')
  await expect(page.locator('.toast')).toContainText('Danke')

  await page.click('.lobby-foot a[href="/impressum"]')
  await expect(page.locator('.legal h1')).toHaveText('Impressum')
  await expect(page.locator('.legal-body')).toContainText('§ 5 DDG')
})

test('export the map view as PNG', async ({ page }) => {
  await page.goto('/local')
  await joinAs(page, 'Tyo', 'GER')
  const download = page.waitForEvent('download')
  await page.click('.file-group button:has(svg.lucide-image-down)')
  const file = await download
  expect(file.suggestedFilename()).toMatch(/\.png$/)
  await expect(page.locator('.toast')).toContainText('Bild gespeichert')
})
