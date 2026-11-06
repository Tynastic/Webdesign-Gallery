import { expect, test } from '@playwright/test'
import { joinAs, removeRoom } from './helpers'

const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin'

test('the admin finds unused rooms and deletes them', async ({ browser, request }) => {
  const status = await (await request.get('/api/admin/session')).json()
  test.skip(!status.enabled, 'the running server has no ADMIN_PASSWORD')

  const stamp = Date.now().toString(36)
  const unused = await (await request.post('/api/rooms', { data: { title: `E2E unused ${stamp}` } })).json()
  const used = await (await request.post('/api/rooms', { data: { title: `E2E used ${stamp}`, password: 'pw' } })).json()

  // Someone signs up in the used room.
  const player = await (await browser.newContext()).newPage()
  await player.goto(`/r/${used.id}`)
  await player.fill('.gate input', 'pw')
  await player.click('.gate button[type=submit]')
  await joinAs(player, 'Max', 'ITA')

  // The admin logs in on /admin.
  const page = await (await browser.newContext()).newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/admin')
  await page.fill('.admin-login input', PASSWORD)
  await page.click('.admin-login button[type=submit]')
  await page.fill('.admin-filters input[type=search]', stamp)
  const row = (title: string) => page.locator('.admin-row').filter({ hasText: title })
  await expect(row('E2E used')).toContainText('1 Spieler (0 zugeteilt)')
  await expect(row('E2E used')).toContainText('1 online')
  await expect(row('E2E unused')).toContainText('leer')

  // "Unused" shows only the empty room; select everything shown and delete it.
  await page.locator('.admin-filters .segmented button').filter({ hasText: 'Ungenutzt' }).click()
  await expect(page.locator('.admin-row')).toHaveCount(1)
  await page.locator('.admin-bulk input[type=checkbox]').check()
  await page.locator('.admin-bulk .btn.danger').click()
  await page.click('dialog.confirm .btn.danger')
  await expect(page.locator('.toast')).toContainText('1 Raum gelöscht')
  expect((await (await request.get(`/api/rooms/${unused.id}`)).json()).exists).toBe(false)
  expect((await (await request.get(`/api/rooms/${used.id}`)).json()).exists).toBe(true)

  // The lobby links back here for the admin.
  await page.goto('/')
  await expect(page.locator('.admin-note a[href="/admin"]')).toBeVisible()
  expect(errors).toEqual([])
  await removeRoom(request, used.id, used.ownerToken)
})
