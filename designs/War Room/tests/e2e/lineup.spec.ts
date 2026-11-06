import { expect, test } from '@playwright/test'
import { joinAs, removeOwnRoom } from './helpers'

const match = (page: import('@playwright/test').Page, nation: string) =>
  page.evaluate((n) => {
    const r = (window as unknown as { __cow: { match: { current: { roles: Map<string, { team: string | null; player: { name: string } | null }> } } } }).__cow.match.current.roles.get(n)!
    return { team: r.team, player: r.player?.name ?? null }
  }, nation)

test('the room creator organizes the line-up; everyone else signs up and sees it read-only', async ({ browser }) => {
  const errors: string[] = []
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  for (const p of [a, b]) p.on('pageerror', (e) => errors.push(e.message))

  // The creator seats themselves on Germany.
  await a.goto('/')
  await a.fill('.lobby-card input[maxlength="80"]', 'E2E line-up')
  await a.click('.lobby-card button[type=submit]')
  await a.waitForURL(/\/r\//)
  await joinAs(a, 'Organizer', 'GER')
  await expect(a.locator('.me-chip')).toContainText('Organizer (Deutschland)')

  // A second player only asks for Italy and lands on the bench.
  await b.goto(a.url())
  await joinAs(b, 'Max', 'ITA')
  await expect(b.locator('.me-chip')).toContainText('Max (noch ohne Nation)')

  // The creator sees the wish and seats Max with one click, then moves both nations to the Axis.
  await a.keyboard.press('l')
  const italy = a.locator('.lineup-card[data-nation=ITA]')
  await italy.locator('.lc-wishes .chip').filter({ hasText: 'Max' }).click()
  await italy.locator('.lc-move button').first().click()
  await a.locator('.lineup-card[data-nation=GER] .lc-move button').first().click()
  await expect.poll(() => match(a, 'ITA')).toEqual({ team: 'axis', player: 'Max' })

  // Max now plays Italy, on the Axis, and sees the board without controls.
  await expect.poll(() => match(b, 'ITA')).toEqual({ team: 'axis', player: 'Max' })
  await expect(b.locator('.me-chip')).toContainText('Max (Italien)')
  await expect(b.locator('.me-chip .team-swatch')).toHaveCount(1)
  await b.keyboard.press('l')
  await expect(b.locator('.lineup-readonly')).toBeVisible()
  await expect(b.locator('.lineup-card select')).toHaveCount(0)

  // A write from a non-organizer never reaches the others: the server keeps the line-up read-only for them.
  await b.evaluate(() => {
    const { lineup } = (window as unknown as { __cow: { lineup: { doc: { transact(f: () => void, o: string): void }; slots: { set(k: string, v: unknown): void } } } }).__cow
    lineup.doc.transact(() => lineup.slots.set('USA', { team: 'axis', player: null }), 'local')
  })
  await a.waitForTimeout(1000)
  expect(await match(a, 'USA')).toEqual({ team: null, player: null })

  // The map and the nation overview show who is who.
  await b.keyboard.press('Escape')
  await expect(b.locator('.nation-group.team-axis')).toContainText('Max')
  await expect(b.locator('.nation-group.team-axis')).toContainText('Organizer')
  await expect(b.locator('.map-legend')).toContainText('Achse')
  expect(errors).toEqual([])
  await removeOwnRoom(a)
})
