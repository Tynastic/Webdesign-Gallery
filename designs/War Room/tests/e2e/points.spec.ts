import { expect, test } from '@playwright/test'
import { goToProvince, joinAs, seat } from './helpers'

test('point calculator: prices planned conquests against the daily allowance', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/local')
  await joinAs(page, 'Player', 'GER')
  await expect(page.locator('.points-allowance')).toBeVisible()
  await page.fill('.points-allowance input', '10')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape') // leave the field so shortcuts reach the map

  // Warsaw is Poland's capital. Without a player Poland is an AI nation: its land is free.
  await goToProvince(page, 'Warsaw')
  await page.mouse.click(588, 456)
  await expect(page.locator('.insp-title strong')).toHaveText('Warsaw')
  await expect(page.locator('.prod-tags')).toContainText('Doppelstadt')
  await expect(page.locator('.prod-tags')).toContainText('Hauptstadt')
  await expect(page.locator('.prod-tags')).toContainText('Kernland')
  await expect(page.locator('.prod')).toContainText(/Öl\s*6\.000/)
  await expect(page.locator('.cost-line')).toContainText('0 P. für Player (Deutschland)')
  await expect(page.locator('.cost-line')).toContainText('KI-Land ist frei')

  // Once someone plays Poland on the other team, a capital costs 10.
  await seat(page, 'POL', 'Kasia', { GER: 'axis', POL: 'allies' })
  await expect(page.locator('.cost-line')).toContainText('10 P. für Player (Deutschland)')
  await expect(page.locator('.cost-line')).toContainText('Hauptstadt')

  await page.keyboard.press('p')
  await page.mouse.click(588, 456)
  await expect(page.locator('.to-points')).toHaveText('Punkte: 10 / 10 P.')
  await expect(page.locator('.points-row .points-sum')).toHaveText('10 P. / 10')
  await expect(page.locator('.points-row')).not.toHaveClass(/over/)

  // A second Polish province goes over the allowance.
  await page.mouse.click(660, 456)
  await expect(page.locator('.points-row')).toHaveClass(/over/)
  await expect(page.locator('.to-points')).toHaveClass(/over/)
  await expect(page.locator('.points-over')).toBeVisible()

  // The breakdown lists Warsaw with its rule and the holder's class.
  await page.click('.points-head')
  await expect(page.locator('.points-item').filter({ hasText: 'Warsaw' })).toContainText('Hauptstadt · Klasse 3')
  expect(errors).toEqual([])
})

test('point counter follows the selected days; planned provinces can be marked as taken', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/local')
  await joinAs(page, 'Player', 'GER')
  await seat(page, 'POL', 'Kasia', { GER: 'axis', POL: 'allies' })
  await page.fill('.points-allowance input', '10')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')

  // Two days.
  for (let i = 0; i < 2; i++) {
    await page.click('.phase-add')
    await page.keyboard.press('Enter')
  }
  const dayChip = (name: string) => page.locator('.phase-bar .phase-chip').filter({ hasText: name })
  await goToProvince(page, 'Warsaw')

  // The plan tool puts the Points panel on top and drops the Layers panel.
  await page.keyboard.press('p')
  await expect(page.locator('.sheet-body > section').first()).toHaveAttribute('aria-labelledby', 'ph-points')
  await expect(page.locator('#ph-layers')).toHaveCount(0)

  await dayChip('Phase 1').click()
  await page.mouse.click(588, 456)
  await expect(page.locator('.to-points')).toHaveText('Punkte: 10 / 10 P.')
  await dayChip('Phase 2').click()
  await page.mouse.click(660, 456)
  const day2 = await page.locator('.to-points').textContent()
  expect(day2).not.toContain('10 / 10')

  // All days: the limit is the allowance × 2 and each day shows its own count.
  await page.locator('.phase-bar .phase-chip').filter({ hasText: 'Alle' }).click()
  await expect(page.locator('.to-points')).toContainText('/ 20 P. · 2 Tage')
  await expect(page.locator('.points-day')).toHaveCount(2)
  await expect(page.locator('.points-day').first()).toContainText('10/10')

  // Points panel: count only day 1.
  await page.locator('.points-scope .phase-chip').filter({ hasText: 'Phase 1' }).click()
  await expect(page.locator('.points-row .points-sum')).toHaveText('10 P. / 10')

  // Mark taken from the map, then from the panel.
  await page.locator('.segmented button').filter({ hasText: 'Eingenommen' }).click()
  await page.mouse.click(588, 456)
  await expect(page.locator('.points-meta')).toContainText('✓ 1 erobert')
  await page.locator('.points-scope .phase-chip').filter({ hasText: 'Alle Tage' }).click()
  await page.click('.points-head')
  await page.locator('.points-take[aria-pressed=false]').click()
  await expect(page.locator('.points-meta')).toContainText('✓ 2 erobert')
  // Taken provinces still count against the allowance.
  await expect(page.locator('.points-day').first()).toContainText('10/10')
  expect(errors).toEqual([])
})
