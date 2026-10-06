import { expect, test } from '@playwright/test'
import { counts, goToProvince, joinAs } from './helpers'

test('two players share a room live', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()

  await a.goto('/')
  await a.fill('.lobby-card input[maxlength="80"]', 'E2E room')
  await a.click('.lobby-card button[type=submit]')
  await a.waitForURL(/\/r\//)
  await joinAs(a, 'Tyo', 'GER')

  await b.goto(a.url())
  await joinAs(b, 'Max', 'ITA')
  await expect.poll(() => counts(a).then((c) => c.nations)).toBe(2)

  // A conquers Poland; B's map follows.
  await goToProvince(a, 'Warsaw')
  await a.keyboard.press('c')
  await a.keyboard.down('Shift')
  await a.mouse.click(588, 456)
  await a.keyboard.up('Shift')
  const owned = (await counts(a)).owned
  expect(owned).toBeGreaterThan(30)
  await expect.poll(() => counts(b).then((c) => c.owned)).toBe(owned)

  // Presence: B sees A's avatar and cursor, and A's ping.
  await goToProvince(b, 'Warsaw')
  await a.mouse.move(600, 420)
  await a.mouse.move(610, 430)
  await expect(b.locator('.presence .avatar')).toHaveCount(1)
  await expect(b.locator('.peer-cursor')).toHaveCount(1)
  await a.keyboard.down('Alt')
  await a.mouse.click(640, 470)
  await a.keyboard.up('Alt')
  await expect(b.locator('.ping')).toHaveCount(1)

  // A late joiner gets the stored state from the server.
  const c = await (await browser.newContext()).newPage()
  await c.goto(a.url())
  await c.waitForSelector('dialog.join[open]')
  await expect.poll(() => counts(c).then((x) => x.owned)).toBe(owned)
})

test('password-protected room', async ({ browser, request }) => {
  const res = await request.post('/api/rooms', { data: { title: 'Secret', password: 'hunter2' } })
  const { id } = await res.json()
  const page = await (await browser.newContext()).newPage()
  await page.goto(`/r/${id}`)
  await page.fill('.gate input', 'wrong')
  await page.click('.gate button[type=submit]')
  await expect(page.locator('.gate .err')).toContainText('Falsches Passwort') // German is the default
  await page.fill('.gate input', 'hunter2')
  await page.click('.gate button[type=submit]')
  await page.waitForSelector('dialog.join[open]')
})
