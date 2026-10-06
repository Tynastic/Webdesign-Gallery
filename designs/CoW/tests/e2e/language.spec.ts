import { expect, test } from '@playwright/test'
import { joinAs } from './helpers'

test('German by default, switchable to English without reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.lobby h1')).toHaveText('War Room')
  await expect(page.locator('.lobby-card h2').first()).toContainText('Neuer gemeinsamer Plan')
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')

  await page.goto('/local')
  await joinAs(page, 'Tyo', 'GER')
  await expect(page.locator('.statusbar')).toContainText('Objekt oder Provinz anklicken')
  await expect(page.locator('.nation-sub').first()).toContainText('Deutschland')

  // Switch in the View panel: UI, nation names and status hint follow immediately.
  await page.click('.panel:has(#ph-map-style) [role=radio]:has-text("English")')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('.statusbar')).toContainText('Click an object or province')
  await expect(page.locator('.nation-sub').first()).toContainText('Germany')

  // The choice is remembered.
  await page.reload()
  await page.waitForSelector('.cow-canvas')
  await expect(page.locator('.statusbar')).toContainText('Click an object or province')
})
