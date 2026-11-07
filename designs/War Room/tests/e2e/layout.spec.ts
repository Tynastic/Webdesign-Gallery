import { expect, test } from '@playwright/test'
import { joinAs } from './helpers'

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
