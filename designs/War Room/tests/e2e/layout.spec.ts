import { expect, test } from '@playwright/test'
import { joinAs, seat } from './helpers'

test('the top bar fits every window width: no sideways scrolling, nothing cut off', async ({ page }) => {
  await page.goto('/local')
  // A long name and nation, like "Maximilian-Alexander (Britisch-Indien)", is what used to push the bar out.
  await joinAs(page, 'Maximilian-Alexander', 'IND')
  for (let width = 1400; width >= 721; width -= 31) {
    await page.setViewportSize({ width, height: 860 })
    const r = await page.evaluate(() => {
      const bar = document.querySelector('.topbar')!
      return { page: document.documentElement.scrollWidth, clipped: bar.scrollWidth - bar.clientWidth }
    })
    expect(r, `at ${width}px`).toEqual({ page: width, clipped: 0 })
  }
})

test('the conquest tools fit a full match: 23 players, every chip reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/local')
  await joinAs(page, 'Tyo', 'GER')
  const axis = ['ITA', 'JPN', 'ROM', 'MAN', 'ESP', 'TUR', 'SWE', 'ARG', 'POL', 'YUG', 'PER']
  const allies = ['UK', 'USA', 'USSR', 'FRA', 'CHN', 'CAN', 'AUS', 'IND', 'BRA', 'RSA', 'NED']
  const teams = Object.fromEntries([['GER', 'axis'], ...axis.map((n) => [n, 'axis']), ...allies.map((n) => [n, 'allies'])])
  for (const [i, nation] of [...axis, ...allies].entries()) await seat(page, nation, `Player ${i + 1}`, teams)
  await page.keyboard.press('p')

  // Desktop: the chips wrap (each team on its own lines) instead of running off both ends of the bar.
  const row = page.locator('.player-pick')
  await expect(row.locator('.pick-chip')).toHaveCount(24) // 23 players + Erase
  const overflowX = () => row.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(await overflowX()).toBe(0)
  await expect(row.locator('.pick-chip').first()).toBeInViewport()
  // The last chips may sit below the fold of the row; picking one scrolls it into view.
  await row.locator('.pick-chip').last().click()
  await expect(row.locator('.pick-chip').last()).toBeInViewport()

  // Phone: one row to swipe, starting with the first chip.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(row.locator('.pick-chip').first()).toBeInViewport()
  expect(await row.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto')
})
