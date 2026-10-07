import { expect, test } from '@playwright/test'
import { goToProvince, joinAs } from './helpers'

test('point calculator: prices planned conquests against the daily allowance', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/local')
  await joinAs(page, 'Tyo', 'GER')
  await expect(page.locator('.points-allowance')).toBeVisible()
  await page.fill('.points-allowance input', '10')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape') // leave the field so shortcuts reach the map

  // Warsaw is a Polish Doppelstadt: Poland is class 5, so its core Doppelstadt costs 9.
  await goToProvince(page, 'Warsaw')
  await page.mouse.click(588, 456)
  await expect(page.locator('.insp-title strong')).toHaveText('Warsaw')
  await expect(page.locator('.prod-tags')).toContainText('Doppelstadt')
  await expect(page.locator('.prod-tags')).toContainText('Kernland')
  await expect(page.locator('.prod')).toContainText(/Öl\s*6\.000/)
  await expect(page.locator('.cost-line')).toContainText('9 P. für Tyo (Deutschland)')

  await page.keyboard.press('p')
  await page.mouse.click(588, 456)
  await expect(page.locator('.to-points')).toHaveText('Punkte: 9 / 10 P.')
  await expect(page.locator('.points-row .points-sum')).toHaveText('9 P. / 10')
  await expect(page.locator('.points-row')).not.toHaveClass(/over/)

  // A second Polish province goes over the allowance.
  await page.mouse.click(660, 456)
  await expect(page.locator('.points-row')).toHaveClass(/over/)
  await expect(page.locator('.to-points')).toHaveClass(/over/)
  await expect(page.locator('.points-over')).toBeVisible()

  // The breakdown lists Warsaw with its category.
  await page.click('.points-head')
  await expect(page.locator('.points-item').filter({ hasText: 'Warsaw' })).toContainText('Feindliches Kernland · Klasse 5')

  // Team toggle: Germany is on the team because it has a player; switching it off and on works.
  const teamTag = page.locator('.nation-row .team-tag')
  await expect(teamTag).toHaveAttribute('aria-pressed', 'true')
  await teamTag.click()
  await expect(teamTag).toHaveAttribute('aria-pressed', 'false')
  expect(errors).toEqual([])
})
